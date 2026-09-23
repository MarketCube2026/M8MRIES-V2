import {describe,it,expect} from 'vitest';
// @ts-ignore JavaScript migration mapping is shared with the CLI.
import {mapLegacy,numberOrNull} from './legacy-map.mjs';
describe('legacy migration',()=>{
  it('retains null amounts and historical score without assuming denominator',()=>{
    const {record,amounts}=mapLegacy({id:'one',status:'saved',form:{requestAmount:''},scores:{total:43}});
    expect(amounts.requested).toBeNull();expect(amounts.approved).toBeNull();
    expect(record.evaluations.create.rawScore).toBe(43);expect(record.evaluations.create.percentile).toBeNull();
    expect(record.status).toBe('APPROVED');expect(record.ledgerEntries.create.approvedAmount).toBeNull();
  });
  it('preserves V1 raw payload field aliases and produces stable IDs',()=>{
    const input={id:'two',updated_at:'2026-07-20T10:00:00Z',raw_payload:{form:{requestAmount:3,academicRights:'展台'},details:{academicRights:4},support:{amount:1.5,level:'D'}}};
    const first=mapLegacy(input);expect(first.record.id).toBe(mapLegacy(input).record.id);
    expect(first.record.scores.create[0]).toMatchObject({key:'academicBenefit',score:4,ruleVersion:'legacy'});
    expect(first.amounts).toEqual({requested:3,recommended:1.5,approved:1.5,actual:null});
    expect(first.record.approvals.create).toMatchObject({decision:'V1历史导入（默认已审核）',approvedAmount:1.5});
    expect(first.record.ledgerEntries.create).toMatchObject({recommendedAmount:1.5,approvedAmount:1.5,year:2026});
    expect(first.record.originalSnapshot).toEqual(input);
  });
  it('does not fabricate an ID or silently accept invalid numbers',()=>{
    expect(()=>mapLegacy({})).toThrow();expect(()=>numberOrNull('abc')).toThrow();
    expect(numberOrNull(0)).toBe(0);
  });
  it('retains unknown status for manual reconciliation',()=>{
    const {record,warnings}=mapLegacy({id:'x',status:'custom'});
    expect(record.legacyStatus).toBe('custom');expect(record.status).toBe('APPROVED');expect(warnings.length).toBeGreaterThan(0);
  });
});
