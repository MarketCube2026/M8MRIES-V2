export const fieldLabels = {
  region: '区域', district: '地区', applicant: '申请人', hospital: '医院 / 会议单位',
  kol: 'KOL', projectName: '项目名称', meetingDate: '会议日期', requestedAmount: '申请金额（万元）',
  background: '合作背景', benefits: '参会权益', currentSales: '当前销量', targetSales: '目标销量',
  inHospitalSubmissionRatio: '院内送检占比', growthPoints: '增长点', department: '科室',
} as const;
export function applicationFields(a: any): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(fieldLabels)) if (a?.[key] != null) result[key] = String(a[key]);
  for (const f of a?.fields || []) result[f.key] = f.confirmedValue ?? f.sourceValue ?? '';
  return result;
}
export function draft(a: any, e: any): string {
  const values = applicationFields(a);
  const f = (key: string) => values[key] || '待补充';
  const money = (value: unknown) => value == null || value === '' ? '待确认' : `${value}万元`;
  return `关于${f('region')}大区${f('district')}地区${f('applicant')}-申请的${f('hospital')}${f('department')}会议赞助，申请总部支持${money(values.requestedAmount)}费用，参会权益：${f('benefits')}。综合评估市场部支持${money(e.defaultAmount)}，其余区域自行承担，请您指示。

【合作背景】${f('background')} 整体医院销量${f('currentSales')}/月，院内送检占比：${f('inHospitalSubmissionRatio')}。

【会议目标】目前销量${f('currentSales')}/月，目标销量${f('targetSales')}/月。增长点：${f('growthPoints')}。

【资源覆盖】${new Date().getFullYear()}年至今${f('region')}大区及${f('hospital')}${f('department')}历史支持情况待核对台账。

【综合评估】已确认得分${e.rawScore ?? '待确认'}，评分档位${e.recommendedRange ?? '待确认'}，建议支持${money(e.defaultAmount)}；请结合参会权益、增长目标及剩余预算确认，请领导知悉。`;
}
