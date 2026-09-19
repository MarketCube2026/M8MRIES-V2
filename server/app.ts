import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';
import { authentication, HttpError, requireRoles, scope } from './security.js';
import { validateFile } from './storage.js';
import { evaluate, options, type ScoreInput, type ScoreKey } from '../src/rules.js';
import { fieldLabels, draft } from '../shared/fields.js';
import type { readConfig } from './config.js';

const include = { fields: true, scores: true, evaluations: { orderBy: { createdAt: 'desc' as const } }, approvals: true, reviews: true, attachments: true };
const money = z.number().finite().nonnegative().max(1e10);
const scoreKeys = Object.keys(options) as ScoreKey[];
const validKeys = new Set([...Object.keys(fieldLabels), ...scoreKeys]);
const normalize = (value: any): any => {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,normalize(v)]));
  return value;
};
export function createApp({ prisma, supabase, storage, config, fetcher = fetch }: {
  prisma: any; supabase: any; storage: any; config: ReturnType<typeof readConfig>; fetcher?: typeof fetch;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin(origin, callback) {
    callback(origin && !config.origins.includes(origin) ? new HttpError(403, '来源不被允许') : null, true);
  } }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: config.RATE_LIMIT_MAX, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/api/health', (_req,res) => res.json({ ok: true }));
  app.get('/api/ready', async (_req,res,next) => {
    try { await prisma.$queryRawUnsafe('SELECT 1'); res.json({ ok: true }); } catch { next(new HttpError(503, '数据库不可用')); }
  });
  app.use('/api', authentication(supabase, prisma));
  app.use('/api', (req,_res,next) => config.WRITE_ENABLED === 'false' && !['GET','HEAD','OPTIONS'].includes(req.method)
    ? next(new HttpError(503, '系统当前只读，正在切换维护')) : next());
  const send = (res: any, data: any) => res.json(normalize(data));
  const audit = (tx: any, req: any, applicationId: string, action: string, before: any, after: any, reason?: string) =>
    tx.auditLog.create({ data: { applicationId, actor: req.identity.id, role: req.identity.role, action,
      beforeJson: before == null ? undefined : JSON.stringify(before), afterJson: after == null ? undefined : JSON.stringify(after), reason } });
  async function get(req: any, tx = prisma) {
    const a = await tx.application.findFirst({ where: { id: String(req.params.id), ...scope(req.identity) }, include });
    if (!a) throw new HttpError(404, '申请不存在或无访问权限');
    return a;
  }
  async function lock(tx: any, req: any) {
    await tx.$queryRawUnsafe('SELECT id FROM v2_applications WHERE id = $1 FOR UPDATE', String(req.params.id));
    return get(req, tx);
  }
  function editable(a: any) {
    if (a.sourceSystem !== 'V2' || ['APPROVED','REJECTED','PENDING_APPROVAL'].includes(a.status))
      throw new HttpError(409, '历史或已提交申请不能覆盖修改');
  }
  function compute(a: any) {
    const input = Object.fromEntries(scoreKeys.map(key => {
      const s = a.scores.find((x: any) => x.key === key);
      const option = options[key].find(x => x.label === s?.option);
      return [key, { option: option?.label, score: option?.score, confirmed: !!option && s?.confirmed }];
    })) as ScoreInput;
    return evaluate(input, a.requestedAmount == null ? undefined : Number(a.requestedAmount));
  }
  async function evaluateAndSave(tx: any, a: any) {
    const e = compute(a);
    return tx.evaluation.create({ data: { applicationId: a.id, rawScore:e.rawScore, percentile:e.percentile,
      grade:e.grade, recommendedRange:e.recommendedRange, defaultAmount:e.defaultAmount, completeness:e.completeness,
      minPossible:e.minPossible,maxPossible:e.maxPossible,confidence:e.confidence,missingKeys:e.missing,
      risks:e.missing.length ? '存在待确认评分项；预算尚未接入' : '预算尚未接入',
      narrative:a.narrativeOverride ?? draft(a,e) } });
  }
  async function updateFields(tx: any, req: any, a: any, fields: Record<string,string>, ocr?: Record<string,any>) {
    const top: any = {};
    for (const [key,value] of Object.entries(fields)) {
      if (!validKeys.has(key)) throw new HttpError(400, '存在不支持的字段');
      if (scoreKeys.includes(key as ScoreKey) && req.identity.role === 'APPLICANT' && !ocr) throw new HttpError(403,'申请人不能确认评分');
      const source = ocr?.[key];
      await tx.extractedField.upsert({ where: { applicationId_key:{applicationId:a.id,key} },
        create:{applicationId:a.id,key,sourceValue:value,confirmedValue:ocr?null:value,sourceText:source?.sourceText,
          confidence:ocr?source.confidence:1,needsConfirmation:ocr?source.needsConfirmation:false},
        update: ocr ? {sourceValue:value,confirmedValue:null,sourceText:source?.sourceText,confidence:source.confidence,needsConfirmation:source.needsConfirmation}
          : {confirmedValue:value,confidence:1,needsConfirmation:false} });
      if (['region','district','applicant','hospital','kol','projectName'].includes(key)) top[key]=value || null;
      if (key==='requestedAmount') {
        if (value!=='' && !/^\d+(\.\d{1,4})?$/.test(value)) throw new HttpError(400,'申请金额必须为万元数值，最多四位小数');
        top.requestedAmount=value===''?null:money.parse(Number(value));
      }
      if (key==='meetingDate') {
        if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)) throw new HttpError(400,'日期必须为有效 YYYY-MM-DD');
        top.meetingDate=value?new Date(value):null;
      }
      if (scoreKeys.includes(key as ScoreKey)) {
        const option=options[key as ScoreKey].find(x=>x.label===value);
        const data={option:value||null,score:option?.score??null,confirmed:!!option && (!ocr || !source.needsConfirmation),evidence:source?.sourceText || '人工确认'};
        await tx.scoreBreakdown.upsert({where:{applicationId_key:{applicationId:a.id,key}},
          create:{applicationId:a.id,key,category:key,maxScore:Math.max(...options[key as ScoreKey].map(x=>x.score)),...data},update:data});
      }
    }
    await tx.application.update({where:{id:a.id},data:{...top,status:'REVIEWING',revision:{increment:1}}});
    await audit(tx,req,a.id,ocr?'OCR_FILL':'FIELDS_UPDATE',a.fields,fields);
  }
  app.get('/api/me',(req,res)=>res.json(req.identity));
  app.get('/api/applications',async(req,res)=>send(res,await prisma.application.findMany({where:scope(req.identity),include,orderBy:{updatedAt:'desc'}})));
  app.get('/api/applications/:id',async(req,res)=>send(res,await get(req)));
  app.post('/api/applications',async(req,res)=>{
    const body=z.object({projectName:z.string().max(300).optional()}).parse(req.body);
    const id=crypto.randomUUID();
    const a=await prisma.$transaction(async(tx:any)=>{
      const a=await tx.application.create({data:{id,ownerId:req.identity.id,projectId:`PRJ-${new Date().getFullYear()}-${id}`,applicationNo:`AI-${id}`,projectName:body.projectName}});
      await audit(tx,req,a.id,'CREATE',null,a);return a;
    }); res.status(201);send(res,a);
  });
  app.patch('/api/applications/:id/fields',async(req,res)=>{
    const fields=z.record(z.string(),z.string().max(12000)).parse(req.body.fields);
    await prisma.$transaction(async(tx:any)=>{const a=await lock(tx,req);editable(a);await updateFields(tx,req,a,fields);await evaluateAndSave(tx,await get(req,tx));});
    res.json({ok:true});
  });
  app.patch('/api/applications/:id/narrative',requireRoles('EVALUATOR','APPROVER'),async(req,res)=>{
    const {narrative}=z.object({narrative:z.string().max(20000).nullable()}).parse(req.body);
    await prisma.$transaction(async(tx:any)=>{const a=await lock(tx,req);editable(a);
      await tx.application.update({where:{id:a.id},data:{narrativeOverride:narrative,revision:{increment:1}}});
      await audit(tx,req,a.id,'NARRATIVE_UPDATE',a.narrativeOverride,narrative);
    });res.json({ok:true});
  });
  app.post('/api/applications/:id/extract',async(req,res)=>{
    const fields=z.record(z.string(),z.string().max(12000)).parse(req.body.fields||{});
    if(!Object.keys(fields).length)throw new HttpError(400,'请上传文件识别，或手动填写字段；不会使用演示数据');
    await prisma.$transaction(async(tx:any)=>{const a=await lock(tx,req);editable(a);await updateFields(tx,req,a,fields);await evaluateAndSave(tx,await get(req,tx));});
    res.json({ok:true});
  });
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:config.MAX_UPLOAD_MB*1024*1024,files:1}});
  async function saveAttachment(req:any) {
    const a=await get(req);editable(a);
    if(!req.file)throw new HttpError(400,'缺少上传文件');
    const {mime,hash}=validateFile(req.file);
    const id=crypto.randomUUID();const key=`${a.id}/${id}`;
    await storage.upload(key,req.file.buffer,mime);
    return prisma.$transaction(async(tx:any)=>{
      const item=await tx.attachment.create({data:{id,applicationId:a.id,fileName:req.file.originalname,filePath:key,mimeType:mime,fileHash:hash}});
      await audit(tx,req,a.id,'ATTACHMENT_UPLOAD',null,{id,hash});return item;
    });
  }
  app.post('/api/applications/:id/attachments',upload.single('file'),async(req,res)=>{res.status(201);send(res,await saveAttachment(req));});
  app.get('/api/applications/:id/attachments/:attachmentId',async(req,res)=>{
    const a=await get(req);const item=a.attachments.find((x:any)=>x.id===req.params.attachmentId);
    if(!item)throw new HttpError(404,'附件不存在');res.json({url:await storage.signedUrl(item.filePath)});
  });
  app.get('/api/ocr/status',async(_req,res)=>{
    try {const response=await fetcher(config.OCR_SERVICE_URL+'/v1/status',{headers:{Authorization:'Bearer '+config.OCR_SERVICE_TOKEN},signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error();const data:any=await response.json();res.json({configured:data.ready,provider:'PaddleOCR + DeepSeek'});}
    catch {res.status(503).json({error:'OCR 服务不可用'});}
  });
  app.post('/api/applications/:id/ocr-service',rateLimit({windowMs:60000,limit:5}),upload.single('file'),async(req,res)=>{
    const attachment=await saveAttachment(req);const start=await get(req);
    const run=await prisma.ocrRun.create({data:{applicationId:start.id,status:'PROCESSING',sourceFile:attachment.filePath,fileHash:attachment.fileHash,ruleVersion:'2026.1'}});
    try {
      const form=new FormData();form.append('file',new Blob([new Uint8Array(req.file!.buffer)],{type:attachment.mimeType}),attachment.mimeType==='application/pdf'?'input.pdf':attachment.mimeType==='image/png'?'input.png':'input.jpg');
      form.append('application_id',start.id);form.append('rule_version','2026.1');
      const response=await fetcher(config.OCR_SERVICE_URL+'/v1/recognize',{method:'POST',headers:{Authorization:'Bearer '+config.OCR_SERVICE_TOKEN},body:form,signal:AbortSignal.timeout(125000)});
      const result:any=await response.json();
      await prisma.ocrRun.update({where:{id:run.id},data:{ocrText:typeof result.ocrText==='string'?result.ocrText:null,resultJson:result}});
      if(!response.ok)throw new HttpError(502,'OCR 识别失败，原文已保留，可人工补充');
      const fields=z.record(z.string(),z.object({value:z.string().max(12000),sourceText:z.string().default(''),confidence:z.number().min(0).max(1),needsConfirmation:z.boolean()})).parse(result.fields);
      const allowed=Object.fromEntries(Object.entries(fields).filter(([key])=>validKeys.has(key)));
      await prisma.$transaction(async(tx:any)=>{
        const a=await lock(tx,req);editable(a);
        if(a.revision!==start.revision)throw new HttpError(409,'识别期间字段已被修改，结果保留但未覆盖，请重试或人工补充');
        await updateFields(tx,req,a,Object.fromEntries(Object.entries(allowed).map(([k,v])=>[k,v.value])),allowed);
        const score=await evaluateAndSave(tx,await get(req,tx));
        await tx.ocrRun.update({where:{id:run.id},data:{status:'COMPLETED',completedAt:new Date(),resultJson:{...result,score:normalize(score)}}});
        await tx.attachment.update({where:{id:attachment.id},data:{ocrText:result.ocrText,extractionStatus:'COMPLETED'}});
      });
      res.json({...result,runId:run.id,fields:allowed});
    }catch(e){
  console.error('[ocr-processing-error]', {
    name: e instanceof Error ? e.name : 'UnknownError',
    code:
      typeof (e as any)?.code === 'string' &&
      /^[A-Z0-9_]{1,40}$/.test((e as any).code)
        ? (e as any).code
        : undefined,
    validation:
      e instanceof z.ZodError
        ? e.issues.map(issue => ({
            path: issue.path.join('.'),
            code: issue.code,
          }))
        : undefined,
  });
  await prisma.ocrRun.update({where:{id:run.id},data:{status:'FAILED',completedAt:new Date(),errorMessage:e instanceof HttpError?e.message:'识别服务调用失败'}});
      throw e instanceof HttpError?e:new HttpError(502,'识别服务调用失败或超时');
    }
  });
  app.get('/api/applications/:id/ocr-runs',async(req,res)=>{await get(req);send(res,await prisma.ocrRun.findMany({where:{applicationId:String(req.params.id)},orderBy:{createdAt:'desc'}}));});
  app.post('/api/applications/:id/score/recalculate',requireRoles('EVALUATOR','APPROVER'),async(req,res)=>{
    const result=await prisma.$transaction(async(tx:any)=>{const a=await lock(tx,req);editable(a);const e=await evaluateAndSave(tx,a);await audit(tx,req,a.id,'SCORE',null,e);return e;});send(res,result);
  });
  app.post('/api/applications/:id/submit',requireRoles('EVALUATOR','APPROVER'),async(req,res)=>{
    const result=await prisma.$transaction(async(tx:any)=>{const a=await lock(tx,req);editable(a);
      await evaluateAndSave(tx,a);const updated=await tx.application.update({where:{id:a.id},data:{status:'PENDING_APPROVAL',revision:{increment:1}}});
      await audit(tx,req,a.id,'SUBMIT',a.status,updated.status);return updated;});send(res,result);
  });
  app.post('/api/applications/:id/approve',requireRoles('APPROVER'),async(req,res)=>{
    const b=z.object({decision:z.enum(['按建议金额支持','同意申请金额','补充资料后审批','暂不支持','CUSTOM']),approvedAmount:money.optional(),note:z.string().max(10000).default('')}).parse(req.body);
    const result=await prisma.$transaction(async(tx:any)=>{
      const a=await lock(tx,req);if(a.sourceSystem!=='V2'||a.status!=='PENDING_APPROVAL')throw new HttpError(409,'只能审批待审批的 V2 申请');
      const e=compute(a);let amount=b.approvedAmount;
      if(b.decision==='按建议金额支持')amount=e.defaultAmount;
      if(b.decision==='同意申请金额'){if(a.requestedAmount==null)throw new HttpError(400,'申请金额未填写');amount=Number(a.requestedAmount);}
      if(b.decision==='暂不支持')amount=0;
      const returned=b.decision==='补充资料后审批';
      if(!returned && amount==null)throw new HttpError(400,'请填写审批金额');
      if(!returned && (b.decision==='CUSTOM'||amount!==e.defaultAmount) && !b.note.trim())throw new HttpError(400,'调整金额时请填写备注');
      const status=returned?'REVIEW_REQUIRED':b.decision==='暂不支持'?'REJECTED':'APPROVED';
      const approval=await tx.approval.create({data:{applicationId:a.id,decision:b.decision,approvedAmount:returned?null:amount,reason:b.note,approver:req.identity.id}});
      await tx.application.update({where:{id:a.id},data:{status,revision:{increment:1}}});
      if(status==='APPROVED')await tx.ledgerEntry.create({data:{applicationId:a.id,region:a.region,hospital:a.hospital,kol:a.kol,requestedAmount:a.requestedAmount,recommendedAmount:e.defaultAmount,approvedAmount:amount,note:b.note,year:new Date().getFullYear()}});
      await audit(tx,req,a.id,'APPROVE',a.status,approval,b.note);return approval;
    });send(res,result);
  });
  app.get('/api/ledger',async(req,res)=>send(res,await prisma.ledgerEntry.findMany({where:{deletedAt:null,application:scope(req.identity)},include:{application:true},orderBy:{createdAt:'desc'}})));
  app.get('/api/ledger/:id',async(req,res)=>{
    const item=await prisma.ledgerEntry.findFirst({where:{id:String(req.params.id),deletedAt:null,application:scope(req.identity)},include:{application:true}});
    if(!item)throw new HttpError(404,'台账不存在');send(res,item);
  });
  app.patch('/api/ledger/:id',requireRoles('APPROVER'),async(req,res)=>{
    const body=z.object({approvedAmount:money.optional(),actualAmount:money.nullable().optional(),note:z.string().max(10000).optional()}).parse(req.body);
    const item=await prisma.$transaction(async(tx:any)=>{
      const before=await tx.ledgerEntry.findUnique({where:{id:String(req.params.id)}});
      if(!before||before.deletedAt)throw new HttpError(404,'台账不存在');
      if(body.approvedAmount!==undefined && Number(before.approvedAmount)!==body.approvedAmount && !body.note?.trim())throw new HttpError(400,'调整审批金额请填写备注');
      const after=await tx.ledgerEntry.update({where:{id:before.id},data:body,include:{application:true}});
      await audit(tx,req,before.applicationId,'LEDGER_UPDATE',before,after,body.note);return after;
    });send(res,item);
  });
  app.delete('/api/ledger/:id',requireRoles('APPROVER'),async(req,res)=>{
    await prisma.$transaction(async(tx:any)=>{const item=await tx.ledgerEntry.findUnique({where:{id:String(req.params.id)}});
      if(!item)throw new HttpError(404,'台账不存在');
      await tx.ledgerEntry.update({where:{id:item.id},data:{deletedAt:new Date()}});
      await audit(tx,req,item.applicationId,'LEDGER_ARCHIVE',item,null);});res.status(204).end();
  });
  app.post('/api/applications/:id/review',async(req,res)=>{
    const b=z.object({targetSales:money.nullable().optional(),actualSales:money.nullable().optional(),actualSpend:money.nullable().optional(),coveredDepartments:z.string().max(5000).optional(),conclusion:z.string().max(20000).optional()}).parse(req.body);
    const result=await prisma.$transaction(async(tx:any)=>{const a=await lock(tx,req);
      if(a.status!=='APPROVED')throw new HttpError(409,'仅已审批项目可复盘');
      const incrementalSales=b.targetSales!=null && b.actualSales!=null?b.actualSales-b.targetSales:null;
      const review=await tx.postEventReview.create({data:{applicationId:a.id,...b,incrementalSales,roi:null}});
      if(b.actualSpend!==undefined)await tx.ledgerEntry.update({where:{applicationId:a.id},data:{actualAmount:b.actualSpend}});
      await audit(tx,req,a.id,'POST_EVENT_REVIEW',null,review);return review;
    });res.status(201);send(res,result);
  });
  app.get('/api/audit-logs',requireRoles('EVALUATOR','APPROVER'),async(_req,res)=>send(res,await prisma.auditLog.findMany({orderBy:{createdAt:'desc'},take:200})));
  app.get('/api/bi/health',(_req,res)=>res.json({configured:false}));
  app.use('/api',(_req,_res,next)=>next(new HttpError(404,'接口不存在')));
  app.use((error:any,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const status=error instanceof HttpError?error.status:error instanceof z.ZodError?400:error instanceof multer.MulterError?413:500;
  if (status >= 500) {
  console.error("[api-error]", {
    method: req.method,
    path: req.path,
    name: typeof error?.name === "string" ? error.name : "UnknownError",
    code:
      typeof error?.code === "string" &&
      /^[A-Z0-9_]{1,40}$/.test(error.code)
        ? error.code
        : undefined,
  });
}

    res.status(status).json({error:error instanceof HttpError?error.message:status===400?'请求字段格式不正确':status===413?'上传文件过大或数量超限':'服务暂不可用，请联系管理员'});
  });
  return app;
}
