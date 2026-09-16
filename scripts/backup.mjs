import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve('backups',stamp);
await fs.mkdir(out,{recursive:true});
const manifest={createdAt:new Date().toISOString(),files:[],notes:[]};
const save=async(name,bytes)=>{
  await fs.mkdir(path.dirname(path.join(out,name)),{recursive:true});
  await fs.writeFile(path.join(out,name),bytes,{mode:0o600});
  manifest.files.push({name,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
};
// Preserve the local running prototype without stopping it.
try{
  const health=await fetch('http://127.0.0.1:4000/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());
  if(health.mock)for(const endpoint of ['applications','ledger']){
    const response=await fetch('http://127.0.0.1:4000/api/'+endpoint);if(!response.ok)throw new Error();
    await save('local-prototype-'+endpoint+'.json',JSON.stringify(await response.json(),null,2));
  }
}catch{manifest.notes.push('Local prototype export unavailable');}
const v1Repo='https://github.com/MarketCube2026/M1MRIES.git';
const mirror=path.join(out,'v1.git');
const clone=spawnSync('git',['clone','--mirror',v1Repo,mirror],{encoding:'utf8'});
if(clone.status===0){
  const sha=spawnSync('git',['--git-dir',mirror,'rev-parse','refs/heads/gh-pages'],{encoding:'utf8'});
  if(sha.status===0){
    manifest.v1SourceCommit=sha.stdout.trim();
    const archive=spawnSync('git',['--git-dir',mirror,'archive','--format=zip',sha.stdout.trim()],{maxBuffer:100*1024*1024});
    if(archive.status===0)await save('v1-gh-pages.zip',archive.stdout);
  }
}else manifest.notes.push('V1 git mirror unavailable');
// Cloud export requires service credentials and stays in ignored backups/.
if(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY){
  const {createClient}=await import('@supabase/supabase-js');
  const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const rows=[];let failed=false;
  for(let offset=0;;offset+=1000){
    const {data,error}=await client.from('applications').select('*').order('id').range(offset,offset+999);
    if(error){failed=true;manifest.notes.push('Supabase applications export failed');break;}
    rows.push(...data);if(data.length<1000)break;
  }
  if(!failed)await save('v1-cloud-applications.json',JSON.stringify(rows,null,2));
  manifest.notes.push('Row export is not a full database/storage backup; also use the documented pg_dump and Storage inventory procedure');
}else manifest.notes.push('Cloud export blocked: Supabase service credentials not configured');
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
console.log(JSON.stringify({directory:out,files:manifest.files.map(f=>f.name),notes:manifest.notes}));
