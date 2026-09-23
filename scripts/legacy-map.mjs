import crypto from 'node:crypto';
export const numberOrNull = (value) => {
  if(value === null || value === undefined || value === '') return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)throw new Error('金额/评分必须为非负有限数值');
  return n;
};
const text = value => value == null || value === '' ? null : String(value);
const aliases = [
  ['meetingLevel','meetingLevel','meeting_level'],['academicBenefit','academicRights','academic_rights'],
  ['expertLevel','expertLevel','expert_level'],['productType','productType','product_type'],
  ['hospitalValue','hospitalValue','hospital_value'],['monthlySales','monthlySales','monthly_sales'],
  ['salesTrend','salesTrend','sales_trend'],['growthOpportunity','growthOpportunity','growth_opportunity'],
  ['communication','communicationValue','communication_value'],['execution','executionQuality','execution_quality'],
];
export function mapLegacy(row, {batch,ownerMap={},source='V1'} = {}) {
  const raw=row.raw_payload && typeof row.raw_payload==='object'?row.raw_payload:row;
  const legacyId=text(row.id ?? raw.id);
  if(!legacyId)throw new Error('缺少稳定旧记录 ID，不能安全去重');
  const id='legacy-'+crypto.createHash('sha256').update(source+':'+legacyId).digest('hex').slice(0,32);
  const form=raw.form||{};
  const get=(formKey,column)=>form[formKey]??row[column]??null;
  const status=text(row.status??raw.status)??'unknown';
  const states={saved:'REVIEWING',draft:'DRAFT',approved:'APPROVED',rejected:'REJECTED',pending:'PENDING_APPROVAL',
    APPROVED:'APPROVED',REJECTED:'REJECTED',DRAFT:'DRAFT',PENDING_APPROVAL:'PENDING_APPROVAL'};
  const date=get('meetingDate','meeting_date');
  if(date && Number.isNaN(Date.parse(date)))throw new Error('会议日期无效');
  const amount=(value)=>{const n=numberOrNull(value);if(n!=null && (n>1e10 || Math.abs(n*10000-Math.round(n*10000))>0.0001))throw new Error('金额超范围或精度超过四位小数');return n;};
  const requested=amount(get('requestAmount','requested_amount'));
  const recommended=amount(raw.support?.amount??row.support_amount);
  const sourceApproved=amount(row.approved_amount??raw.approvedAmount);
  const approved=sourceApproved??recommended;
  const actual=amount(row.actual_amount??raw.actualAmount);
  const approvalDateValue=row.approved_at??row.updated_at??row.created_at??date;
  const approvalDate=approvalDateValue?new Date(approvalDateValue):new Date();
  if(Number.isNaN(approvalDate.getTime()))throw new Error('历史审批日期无效');
  const rawScore=numberOrNull(raw.scores?.total??row.total_score);
  if(rawScore!=null && !Number.isInteger(rawScore))throw new Error('历史总分非整数，需人工核对');
  const scores=aliases.flatMap(([key,old,column])=>{
    const score=numberOrNull(raw.details?.[old]??row[column+'_score']);
    if(score===null)return [];
    if(!Number.isInteger(score))throw new Error('分项得分非整数');
    return [{key,category:key,option:text(get(old,column)),score,maxScore:null,confirmed:true,ruleVersion:'legacy',evidence:'历史原始评分，未重新计算'}];
  });
  const fields=Object.entries({
    benefits:get('benefits','benefits')??get('academicRights','academic_rights'),
    background:get('background','background'), currentSales:get('monthlySales','monthly_sales'),
    growthPoints:get('growthPoints','growth_points'),inHospitalSubmissionRatio:get('inHospitalSubmissionRatio','in_hospital_submission_ratio'),
    department:get('department','department'),meetingContent:get('meetingContent','meeting_content'),
  }).filter(([,v])=>v!=null).map(([key,v])=>({key,sourceValue:String(v),confirmedValue:String(v),confidence:1,needsConfirmation:false}));
  const ownerId=ownerMap[legacyId]??null;
  if(ownerId && !/^[0-9a-f-]{36}$/i.test(ownerId))throw new Error('负责人必须为 Supabase 用户 UUID');
  const warnings=[];
  if(!states[status])warnings.push('未知状态：保留原状态并标记待核对');
  if(!ownerId)warnings.push('未映射负责人：仅评估员/审批人可见');
  if(sourceApproved===null && recommended!==null)warnings.push('未提供审批金额：按历史建议金额默认已审核');
  if(!approvalDateValue)warnings.push('未提供审批时间：使用迁移时间');
  if(raw.attachments?.length || row.attachments?.length)warnings.push('附件原始引用保留于快照，需单独迁移文件并核对');
  const record={id,projectId:'PRJ-'+id,applicationNo:'LEGACY-'+id,
    ownerId,sourceSystem:source,legacyId,legacyStatus:status,migrationBatch:batch,
    originalSnapshot:row,status:'APPROVED',
    region:text(get('region','region')),district:text(get('district','district')),applicant:text(get('applicant','applicant')),
    hospital:text(get('hospital','hospital')),kol:text(get('kol','kol')),projectName:text(get('projectName','project_name')),
    meetingDate:date?new Date(date):null,requestedAmount:requested,
    fields:{create:fields},scores:{create:scores},
    evaluations:{create:{rawScore,percentile:null,grade:text(raw.support?.level??row.support_level),
      recommendedRange:text(raw.support?.range??row.support_range),defaultAmount:recommended,
      narrative:text(raw.evaluation??row.evaluation),ruleVersion:'legacy',risks:'历史原始记录；评分分母未确认，不换算百分制'}},
    approvals:{create:{decision:'V1历史导入（默认已审核）',approvedAmount:approved,reason:'V1历史数据迁移',approver:'migration:v1',createdAt:approvalDate}},
    ledgerEntries:{create:{
      requestedAmount:requested,recommendedAmount:recommended,approvedAmount:approved,actualAmount:actual,
      note:text(row.note??raw.note??raw.budgetNote??row.budget_note)??'V1历史数据迁移',year:approvalDate.getFullYear(),
      region:text(get('region','region')),hospital:text(get('hospital','hospital')),kol:text(get('kol','kol')),createdAt:approvalDate}},
  };
  return {record,warnings,amounts:{requested,recommended,approved,actual}};
}
