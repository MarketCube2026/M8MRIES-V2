import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { mapLegacy } from './legacy-map.mjs';
import { canonical } from './canonical.mjs';
import { parseLegacyInput } from './legacy-input.mjs';
const args=process.argv.slice(2);
const input=args.find(arg=>!arg.startsWith('--'));
if(!input)throw new Error('用法: npm run migrate:legacy -- input.json [--apply] [--owners=owners.json] [--batch=ID]');
const apply=args.includes('--apply');
const batch=args.find(x=>x.startsWith('--batch='))?.slice(8)||new Date().toISOString().replace(/[:.]/g,'-');
const ownerPath=args.find(x=>x.startsWith('--owners='))?.slice(9);
const ownerMap=ownerPath?JSON.parse(await fs.readFile(ownerPath,'utf8')):{};
const contents=await fs.readFile(input,'utf8');
const rows=parseLegacyInput(contents,input);
const report={batch,inputHash:crypto.createHash('sha256').update(contents).digest('hex'),mode:apply?'apply':'dry-run',sourceCount:rows.length,inserted:0,skipped:0,errors:[],warnings:[],totals:{requested:0,recommended:0,approved:0,actual:0},nullCounts:{requested:0,recommended:0,approved:0,actual:0}};
const prepared=[];const seen=new Map();
rows.forEach((row,index)=>{
  try{
    const mapped=mapLegacy(row,{batch,ownerMap});
    if(JSON.stringify(row).includes('\uFFFD'))report.warnings.push({index,message:'文本包含异常替换字符，原样保留，需核对'});
    const columnAmount=row.requested_amount===null||row.requested_amount===undefined||row.requested_amount===''?null:Number(row.requested_amount);
    if(Object.hasOwn(row,'requested_amount') && columnAmount!==mapped.amounts.requested){
      const formAmount=row.raw_payload?.form?.requestAmount;
      const knownEmptyDefault=columnAmount===0 && (formAmount===null||formAmount===undefined||formAmount==='') && mapped.amounts.requested===null;
      report.warnings.push({index,message:knownEmptyDefault?'申请金额列为0但原始表单未填写：按缺失保留':'申请金额列与原始数据不一致，正式迁移前需核对'});
    }
    const signature=canonical(row);
    if(seen.has(mapped.record.id)){
      if(seen.get(mapped.record.id)!==signature)throw new Error('同一旧 ID 有不同数据版本，请先核对云端与浏览器差异');
      report.skipped++;return;
    }
    seen.set(mapped.record.id,signature);prepared.push(mapped);
    mapped.warnings.forEach(message=>report.warnings.push({index,id:mapped.record.legacyId,message}));
    for(const [key,value] of Object.entries(mapped.amounts)){
      if(value===null)report.nullCounts[key]++;else report.totals[key]=Math.round((report.totals[key]+value)*10000)/10000;
    }
  }catch(error){report.errors.push({index,message:error.message});}
});
if(apply && report.warnings.some(w=>w.message.includes('需核对')))report.errors.push({message:'存在未解决的数据差异，已阻止写入；请核对来源后重新导出'});
if(apply && !report.errors.length){
  const {PrismaClient}=await import('@prisma/client');const prisma=new PrismaClient();
  try{
    await prisma.$transaction(async tx=>{
      for(const {record} of prepared){
        const existing=await tx.application.findUnique({where:{sourceSystem_legacyId:{sourceSystem:record.sourceSystem,legacyId:record.legacyId}}});
        if(existing){
          if(canonical(existing.originalSnapshot)!==canonical(record.originalSnapshot))throw new Error('源记录已改变；不能覆盖已导入数据');
          report.skipped++;continue;
        }
        await tx.application.create({data:record});
        await tx.auditLog.create({data:{applicationId:record.id,actor:'migration',role:'EVALUATOR',action:'LEGACY_IMPORT',afterJson:JSON.stringify({batch,inputHash:report.inputHash,legacyId:record.legacyId})}});
        report.inserted++;
      }
    },{timeout:120000});
    report.persistedCount=await prisma.application.count({where:{sourceSystem:'V1'}});
  }catch(error){report.inserted=0;report.errors.push({message:'数据库事务失败，未提交本批次；检查数据库与记录约束'});}
  finally{await prisma.$disconnect();}
}
await fs.mkdir('migration-reports',{recursive:true});
await fs.writeFile('migration-reports/'+batch+'.json',JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({mode:report.mode,sourceCount:report.sourceCount,prepared:prepared.length,inserted:report.inserted,skipped:report.skipped,errorCount:report.errors.length,warningCount:report.warnings.length,report:'migration-reports/'+batch+'.json'}));
if(report.errors.length)process.exitCode=1;
