import {describe,it,expect} from 'vitest';
import {evaluate,options,bands,type ScoreInput} from './rules';
describe('versioned scoring',()=>{
  it('sums full score to 100',()=>{
    const input=Object.fromEntries(Object.entries(options).map(([key,list])=>[key,{score:Math.max(...list.map(x=>x.score)),confirmed:true}])) as ScoreInput;
    expect(evaluate(input)).toMatchObject({rawScore:100,percentile:100,grade:'S++',missing:[]});
  });
  it('counts all absent dimensions instead of treating an empty object as complete',()=>{
    expect(evaluate({})).toMatchObject({rawScore:0,completeness:0,maxPossible:100});
    expect(evaluate({meetingLevel:{score:6,confirmed:true}})).toMatchObject({rawScore:6,maxPossible:96});
  });
  it('covers every integer score with exactly one amount band',()=>{
    for(let score=0;score<=100;score++)expect(bands.filter(b=>score>=b.min&&score<=b.max)).toHaveLength(1);
  });
  it('caps by request and available budget including zero',()=>{
    expect(evaluate({},0).defaultAmount).toBe(0);
    expect(evaluate({},3,.2).defaultAmount).toBe(.2);
  });
});
