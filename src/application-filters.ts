import { applicationFields } from '../shared/fields';

export const applicationStatuses: Record<string, string> = {
  DRAFT: '草稿', EXTRACTED: '已提取', REVIEWING: '待确认',
  PENDING_APPROVAL: '待审批', APPROVED: '已通过', REJECTED: '已驳回',
};

export type ApplicationFilters = {
  query: string; status: string; region: string; from: string; to: string;
};
export const emptyApplicationFilters: ApplicationFilters = {
  query: '', status: '', region: '', from: '', to: '',
};

export function applicationDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) : '';
}

export function filterApplications(applications: any[], filters: ApplicationFilters) {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return applications.filter((application) => {
    const fields = applicationFields(application);
    const text = [application.projectId, application.applicationNo, ...Object.values(fields)]
      .filter(value => value != null).join(' ').toLocaleLowerCase();
    const date = applicationDate(application.updatedAt);
    return terms.every(term => text.includes(term)) &&
      (!filters.status || application.status === filters.status) &&
      (!filters.region || fields.region === filters.region) &&
      (!filters.from || (date !== '' && date >= filters.from)) &&
      (!filters.to || (date !== '' && date <= filters.to));
  });
}

export function displayAmount(value: unknown): string {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '未填写';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 }) + ' 万元';
}
