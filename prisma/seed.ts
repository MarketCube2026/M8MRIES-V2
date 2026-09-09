import { PrismaClient } from '@prisma/client';
import { options, bands } from '../src/rules.js';
const prisma=new PrismaClient();
async function main(){ for(const [key,items] of Object.entries(options))for(const item of items)await prisma.ruleOption.upsert({where:{key_label:{key,label:item.label}},create:{key,label:item.label,score:item.score,maxScore:Math.max(...items.map(x=>x.score)),category:key},update:{score:item.score}}); for(const b of bands)await prisma.amountBand.create({data:{minScore:b.min,maxScore:b.max,grade:b.grade,rangeLabel:b.range,defaultAmount:b.amount}}); console.log('seeded'); }
main().finally(()=>prisma.$disconnect());
