type OcrResult = { text: string; fields?: Record<string, string>; provider: string };

export function ocrConfigured() {
  return Boolean(process.env.OCR_API_KEY && process.env.OCR_ENDPOINT);
}

export async function recognizeImage(imageDataUrl: string): Promise<OcrResult> {
  const endpoint = process.env.OCR_ENDPOINT;
  const apiKey = process.env.OCR_API_KEY;
  const model = process.env.OCR_MODEL || 'gpt-4o-mini';
  if (!endpoint || !apiKey) throw new Error('OCR 未配置：请设置 OCR_ENDPOINT、OCR_API_KEY');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: '请识别这张资源支持申请截图。只返回JSON，字段包括 region,district,applicant,hospital,kol,projectName,meetingDate,requestedAmount,background,benefits,currentSales,targetSales。无法确认的字段返回空字符串。另返回原文 text。' },
        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
      ] }],
    }),
  });
  if (!response.ok) throw new Error(`OCR 服务错误 ${response.status}: ${await response.text()}`);
  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OCR 服务未返回识别内容');
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;
  const { text = '', ...fields } = parsed;
  return { text, fields, provider: endpoint };
}
