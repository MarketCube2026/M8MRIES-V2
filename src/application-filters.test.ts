import { describe, expect, it } from 'vitest';
import { applicationDate, displayAmount, emptyApplicationFilters, filterApplications } from './application-filters';

const rows = [
  { id: '1', projectId: 'PRJ-001', applicationNo: 'AI-001', projectName: '肺癌会议',
    hospital: '第一医院', applicant: '张三', kol: '李医生', region: '南区',
    status: 'APPROVED', updatedAt: '2026-10-01T16:10:00Z', fields: [] },
  { id: '2', projectName: '病理会议', status: 'DRAFT', updatedAt: null,
    fields: [{ key: 'hospital', confirmedValue: '第二医院' }, { key: 'region', sourceValue: '北区' }] },
  ...Array.from({ length: 25 }, (_, i) => ({ id: String(i + 3), status: 'REVIEWING' })),
];
describe('application list filters', () => {
  it('includes all records without the overview six-record limit', () => {
    expect(filterApplications(rows, emptyApplicationFilters)).toHaveLength(27);
  });
  it('searches IDs, hospitals, applicants, KOL and extracted fields with AND terms', () => {
    for (const query of ['PRJ-001', 'AI-001', '张三', '李医生', '第一医院 肺癌']) {
      expect(filterApplications(rows, { ...emptyApplicationFilters, query }).map(row => row.id)).toEqual(['1']);
    }
    expect(filterApplications(rows, { ...emptyApplicationFilters, query: '第二医院' })[0].id).toBe('2');
  });
  it('combines status, region and inclusive Shanghai calendar dates', () => {
    expect(filterApplications(rows, { query: '', status: 'APPROVED', region: '南区',
      from: '2026-10-02', to: '2026-10-02' }).map(row => row.id)).toEqual(['1']);
    expect(filterApplications(rows, { ...emptyApplicationFilters, from: '2026-10-03' })).toHaveLength(0);
    expect(filterApplications(rows, { ...emptyApplicationFilters, region: '北区' })[0].id).toBe('2');
  });
  it('does not treat missing dates or amounts as zero', () => {
    expect(applicationDate('invalid')).toBe('');
    expect(displayAmount(null)).toBe('未填写');
    expect(displayAmount(0)).toBe('0 万元');
    expect(displayAmount('2.88')).toBe('2.88 万元');
  });
});
