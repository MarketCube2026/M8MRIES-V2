import 'dotenv/config';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import {mapLegacy} from './legacy-map.mjs';
import {parseLegacyInput} from './legacy-input.mjs';
const rows=parseLegacyInput(await fs.readFile(process.argv[2],'utf8'),process.argv[2]);
const db=new PrismaClient();const failures=[];
try{
  for(const row of rows){
    const {record,amounts}=mapLegacy(row);
    const saved=await db.application.findUnique({where:{sourceSystem_legacyId:{sourceSystem:'V1',legacyId:record.legacyId}},include:{evaluations:true,ledgerEntries:true}});
    if(!saved){failures.push({id:record.legacyId,field:'missing'});continue;}
    const values={requested:saved.requestedAmount,recommended:saved.evaluations[0]?.defaultAmount,approved:saved.ledgerEntries[0]?.approvedAmount,actual:saved.ledgerEntries[0]?.actualAmount};
    for(const [key,value] of Object.entries(amounts))if((values[key]==null?null:Number(values[key]))!==value)failures.push({id:record.legacyId,field:key});
    if(saved.legacyStatus!==record.legacyStatus)failures.push({id:record.legacyId,field:'legacyStatus'});
    if(saved.evaluations[0]?.rawScore!==record.evaluations.create.rawScore)failures.push({id:record.legacyId,field:'rawScore'});
  }
  await fs.mkdir('migration-reports',{recursive:true});
  await fs.writeFile('migration-reports/reconciliation.json',JSON.stringify({count:rows.length,failures},null,2),{mode:0o600});
  console.log(JSON.stringify({count:rows.length,mismatches:failures.length}));if(failures.length)process.exitCode=1;
}finally{await db.$disconnect();}
