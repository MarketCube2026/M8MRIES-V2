import { describe, expect, it } from 'vitest';
import { evaluate, ScoreInput } from './rules';

const full = (score:number, confirmed=true):ScoreInput => ({
  meetingLevel:{score,confirmed}, academicBenefit:{score,confirmed}, expertLevel:{score,confirmed}, productType:{score,confirmed}, hospitalValue:{score,confirmed}, monthlySales:{score,confirmed}, salesTrend:{score,confirmed}, growthOpportunity:{score,confirmed}, communication:{score,confirmed}, execution:{score,confirmed}
});

describe('approval scoring rules',()=>{
  it('calculates confirmed score and percentile',()=>{const r=evaluate(full(1));expect(r.rawScore).toBe(10);expect(r.percentile).toBe(10.5);});
  it('does not treat missing indicators as minimum score',()=>{const r=evaluate({...full(3), expertLevel:{confirmed:false}});expect(r.missing).toContain('expertLevel');expect(r.rawScore).toBe(27);expect(r.maxPossible).toBeGreaterThan(r.rawScore);});
  it('maps amount bands and caps by request',()=>{const input=full(5);const r=evaluate(input,2,10);expect(r.grade).toBe('C');expect(r.defaultAmount).toBe(2);});
});
