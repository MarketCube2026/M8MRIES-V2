import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {createApp} from './app';
import type {Server} from 'node:http';
import {readConfig} from './config';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL API integration',()=>{
  const db=new PrismaClient({datasourceUrl:url});
  const applicant='11111111-1111-4111-8111-111111111111';
  const reviewer='22222222-2222-4222-8222-222222222222';
  const approver='33333333-3333-4333-8333-333333333333';
  let server:Server;let base:string;let id:string;
  const request=async(path:string,token:string,method='GET',body?:unknown)=>{
    const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','x-role':'APPROVER'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,data:r.status===204?null:await r.json()};
  };
  beforeAll(async()=>{
    for(const [userId,role] of [[applicant,'APPLICANT'],[reviewer,'EVALUATOR'],[approver,'APPROVER']] as const)
      await db.userAccess.upsert({where:{userId},create:{userId,role},update:{role}});
    const config=readConfig({DATABASE_URL:url,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only-key-not-production',FRONTEND_ORIGIN:'https://example.com',OCR_SERVICE_TOKEN:'test-only-internal-token-123456',RATE_LIMIT_MAX:'1000'});
    const app=createApp({prisma:db,config,supabase:{auth:{getUser:async(token:string)=>({data:{user:{id:token}}})}},storage:{upload:async()=>{}}});
    server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));base='http://127.0.0.1:'+(server.address() as any).port;
  });
  afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db.$disconnect();});
  it('runs fields → score → approval → ledger → review with enforced permissions',async()=>{
    const created=await request('/api/applications',applicant,'POST',{projectName:'integration fixture'});expect(created.status).toBe(201);id=created.data.id;
    const fields={hospital:'测试医院',benefits:'展台',inHospitalSubmissionRatio:'60%',growthPoints:'新增两个科室',requestedAmount:'3'};
    expect((await request('/api/applications/'+id+'/fields',applicant,'PATCH',{fields})).status).toBe(200);
    expect((await request('/api/applications/'+id+'/approve',applicant,'POST',{decision:'CUSTOM',approvedAmount:2})).status).toBe(403);
    expect((await request('/api/applications/'+id+'/approve',reviewer,'POST',{decision:'CUSTOM',approvedAmount:2})).status).toBe(403);
    expect((await request('/api/applications/'+id+'/fields',reviewer,'PATCH',{fields:{meetingLevel:'省级会议'}})).status).toBe(200);
    expect((await request('/api/applications/'+id+'/submit',reviewer,'POST',{})).status).toBe(200);
    expect((await request('/api/applications/'+id+'/approve',approver,'POST',{decision:'CUSTOM',approvedAmount:2})).status).toBe(400);
    expect((await request('/api/applications/'+id+'/approve',approver,'POST',{decision:'CUSTOM',approvedAmount:2,note:'测试调整'})).status).toBe(200);
    expect((await request('/api/applications/'+id+'/approve',approver,'POST',{decision:'CUSTOM',approvedAmount:2,note:'重复'})).status).toBe(409);
    expect((await request('/api/applications/'+id+'/review',applicant,'POST',{targetSales:10,actualSales:12,actualSpend:1.8,conclusion:'测试复盘'})).status).toBe(201);
    const ledger=await db.ledgerEntry.findUniqueOrThrow({where:{applicationId:id}});
    expect(Number(ledger.requestedAmount)).toBe(3);expect(Number(ledger.approvedAmount)).toBe(2);expect(Number(ledger.actualAmount)).toBe(1.8);
    expect(Number(ledger.recommendedAmount)).toBe(.5);
    const persisted=await request('/api/applications/'+id,applicant);
    expect(persisted.data.fields.find((f:any)=>f.key==='growthPoints').confirmedValue).toBe('新增两个科室');
    await expect(db.auditLog.deleteMany({where:{applicationId:id}})).rejects.toThrow();
  });
});
