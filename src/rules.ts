export type ScoreKey = 'meetingLevel'|'academicBenefit'|'expertLevel'|'productType'|'hospitalValue'|'monthlySales'|'salesTrend'|'growthOpportunity'|'communication'|'execution';
export type ScoreInput = Record<ScoreKey, { option?: string; score?: number; confirmed?: boolean; evidence?: string }>;
export const MAX_SCORE = 95;
export const options: Record<ScoreKey, { label:string; score:number }[]> = {
  meetingLevel:[{label:'国际会议',score:10},{label:'国家级会议',score:8},{label:'省级会议',score:6},{label:'市级会议',score:4},{label:'院级会议',score:2}],
  academicBenefit:[{label:'大会报告/卫星会',score:10},{label:'专题讲座/病例分享',score:8},{label:'圆桌讨论',score:6},{label:'展台',score:4},{label:'物料展示',score:2}],
  expertLevel:[{label:'国家级专家',score:10},{label:'省级专家',score:7},{label:'区域专家',score:5},{label:'普通专家',score:3}],
  productType:[{label:'战略核心产品',score:10},{label:'重点增长产品',score:8},{label:'成熟产品',score:5},{label:'常规产品',score:3}],
  hospitalValue:[{label:'新医院突破/进院节点',score:10},{label:'战略医院维护',score:8},{label:'区域重点医院',score:6},{label:'普通合作医院',score:3}],
  monthlySales:[{label:'50万元以上',score:20},{label:'30-50万元',score:15},{label:'20-30万元',score:10},{label:'10-20万元',score:4},{label:'10万元以下',score:2}],
  salesTrend:[{label:'增长≥20%',score:5},{label:'增长0-20%',score:4},{label:'稳定',score:3},{label:'下降',score:1}],
  growthOpportunity:[{label:'明确新增检测量/科室/医院目标',score:10},{label:'推动产品落地',score:8},{label:'医生教育提升',score:5},{label:'客户维护',score:3}],
  communication:[{label:'全国案例素材',score:5},{label:'区域标杆案例',score:3},{label:'区域宣传',score:2},{label:'普通曝光',score:1}],
  execution:[{label:'目标+预算+ROI复盘',score:5},{label:'有目标计划',score:3},{label:'简单执行',score:1}]
};
export const bands = [
  {min:95,max:95,grade:'S++',range:'6-7万元',amount:6.5},{min:90,max:94,grade:'S',range:'5.5-6.5万元',amount:6},{min:85,max:89,grade:'A+',range:'5-6万元',amount:5.5},{min:80,max:84,grade:'A',range:'4.5-5.5万元',amount:5},{min:75,max:79,grade:'B+',range:'4-5万元',amount:4.5},{min:70,max:74,grade:'B',range:'3.5-4.5万元',amount:4},{min:60,max:69,grade:'C+',range:'3-4万元',amount:3.5},{min:50,max:59,grade:'C',range:'2-3万元',amount:2.5},{min:40,max:49,grade:'D',range:'1-2万元',amount:1.5},{min:0,max:39,grade:'E',range:'0-1万元',amount:.5}
];
export function evaluate(input: ScoreInput, requested?: number, remainingBudget = Infinity) {
  const entries = Object.entries(input) as [ScoreKey, ScoreInput[ScoreKey]][];
  const confirmed = entries.filter(([,v])=>v.confirmed && typeof v.score==='number');
  const rawScore = confirmed.reduce((sum,[,v])=>sum+(v.score||0),0);
  const missing = entries.filter(([,v])=>!v.confirmed || typeof v.score!=='number');
  const missingMax = missing.reduce((sum,[key])=>sum+Math.max(...options[key].map(x=>x.score)),0);
  const band = bands.find(b=>rawScore>=b.min && rawScore<=b.max) || bands[bands.length-1];
  const capped = Math.min(band.amount, remainingBudget, requested ?? Infinity);
  return {rawScore, percentile:Math.round(rawScore/MAX_SCORE*1000)/10, missing:missing.map(([k])=>k), minPossible:rawScore, maxPossible:rawScore+missingMax, completeness:Math.round(confirmed.length/entries.length*100), confidence:Math.round(confirmed.length/entries.length*100), grade:band.grade, recommendedRange:band.range, defaultAmount:Number.isFinite(capped)?capped:band.amount, bandAmount:band.amount};
}
