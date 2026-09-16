import rules from '../rules/2026.1.json';
export type ScoreKey = keyof typeof rules.dimensions;
export type ScoreInput = Partial<Record<ScoreKey, { option?: string; score?: number; confirmed?: boolean; evidence?: string }>>;
export const MAX_SCORE = rules.maxScore;
export const options = Object.fromEntries(Object.entries(rules.dimensions).map(([key,d]) => [key,Object.entries(d.options).map(([label,score]) => ({label,score}))])) as Record<ScoreKey,{label:string;score:number}[]>;
export const bands = rules.amountBands;
export function evaluate(input: ScoreInput, requested?: number, remainingBudget = Infinity) {
  const entries = (Object.keys(options) as ScoreKey[]).map(key => [key,input[key] || {}] as const);
  const confirmed = entries.filter(([,v]) => v.confirmed && typeof v.score === 'number' && Number.isFinite(v.score));
  const rawScore = confirmed.reduce((sum,[,v]) => sum + v.score!,0);
  const missing = entries.filter(entry => !confirmed.includes(entry));
  const missingMax = missing.reduce((sum,[key])=>sum+Math.max(...options[key].map(x=>x.score)),0);
  const band = bands.find(b=>rawScore>=b.min && rawScore<=b.max) || bands[bands.length-1];
  const capped = Math.max(0,Math.min(band.amount,remainingBudget,requested??Infinity));
  return {rawScore,percentile:Math.round(rawScore/MAX_SCORE*1000)/10,missing:missing.map(([key])=>key),
    minPossible:rawScore,maxPossible:rawScore+missingMax,completeness:Math.round(confirmed.length/entries.length*100),
    confidence:Math.round(confirmed.length/entries.length*100),grade:band.grade,recommendedRange:band.range,
    defaultAmount:capped,bandAmount:band.amount};
}
