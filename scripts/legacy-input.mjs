import { parse } from 'csv-parse/sync';
export function parseLegacyInput(contents, filename) {
  const parsed = /\.csv$/i.test(filename)
    ? parse(contents, { columns: true, bom: true, skip_empty_lines: true })
    : JSON.parse(contents.replace(/^\uFEFF/, ''));
  const rows = Array.isArray(parsed) ? parsed : parsed.applications;
  if (!Array.isArray(rows)) throw new Error('输入必须为 CSV、JSON 数组或含 applications 数组');
  return rows.map((row, index) => {
    if (typeof row.raw_payload !== 'string' || !row.raw_payload.trim()) return row;
    try {
      const payload = JSON.parse(row.raw_payload);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
      return { ...row, raw_payload: payload };
    } catch { throw new Error('第 ' + (index + 1) + ' 条记录 raw_payload 不是有效 JSON 对象'); }
  });
}
