import {it,expect} from 'vitest';
// @ts-ignore Shared JavaScript migration parser
import {parseLegacyInput} from './legacy-input.mjs';
it('reads BOM CSV with quoted JSON, commas and multiline Chinese',()=>{
  const payload=JSON.stringify({form:{requestAmount:''}});
  const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
  const csv='\uFEFFid,evaluation,raw_payload\r\nx,'+quote('中文,说明\n第二行')+','+quote(payload)+'\r\n';
  const rows=parseLegacyInput(csv,'input.csv');
  expect(rows[0].evaluation).toBe('中文,说明\n第二行');
  expect(rows[0].raw_payload.form.requestAmount).toBe('');
});
it('rejects invalid embedded JSON without silently dropping it',()=>{
  expect(()=>parseLegacyInput('id,raw_payload\nx,broken','input.csv')).toThrow('raw_payload');
});
it('preserves JSON input support',()=>{
  expect(parseLegacyInput('{"applications":[{"id":"x"}]}','input.json')[0].id).toBe('x');
});
