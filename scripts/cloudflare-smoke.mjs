import fs from 'node:fs/promises';
import path from 'node:path';

const required = ['BASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TEST_EMAIL', 'TEST_PASSWORD', 'TEST_IMAGE'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const baseUrl = process.env.BASE_URL.replace(/\/$/, '');
const ocrBaseUrl = (process.env.OCR_BASE_URL || baseUrl).replace(/\/$/, '');
const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const imagePath = path.resolve(process.env.TEST_IMAGE);

const loginResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY },
  body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }),
});
if (!loginResponse.ok) throw new Error(`Test login failed with HTTP ${loginResponse.status}`);
const login = await loginResponse.json();
if (!login.access_token) throw new Error('Test login did not return an access token');

async function api(route, init = {}, targetBase = baseUrl) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${login.access_token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await fetch(`${targetBase}${route}`, { ...init, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${route} failed with HTTP ${response.status}: ${body?.error || 'unknown error'}`);
  return body;
}

const identity = await api('/api/me');
if (identity.role !== 'APPROVER') throw new Error(`Test account has unexpected role: ${identity.role}`);

const application = await api('/api/applications', {
  method: 'POST',
  body: JSON.stringify({ projectName: `[DEPLOYMENT TEST] ${new Date().toISOString()}` }),
});

const bytes = await fs.readFile(imagePath);
const form = new FormData();
form.append('file', new Blob([bytes], { type: 'image/png' }), path.basename(imagePath));
const ocr = await api(`/api/applications/${application.id}/ocr-service`, { method: 'POST', body: form }, ocrBaseUrl);

await api(`/api/applications/${application.id}/score/recalculate`, { method: 'POST' });
await api(`/api/applications/${application.id}/submit`, { method: 'POST' });
await api(`/api/applications/${application.id}/approve`, {
  method: 'POST',
  body: JSON.stringify({ decision: 'CUSTOM', approvedAmount: 1, note: '部署闭环验收记录' }),
});

const reopened = await api(`/api/applications/${application.id}`);
const runs = await api(`/api/applications/${application.id}/ocr-runs`);
const ledger = await api('/api/ledger');
const ledgerEntry = ledger.find(item => item.applicationId === application.id);

if (reopened.status !== 'APPROVED') throw new Error(`Unexpected reopened status: ${reopened.status}`);
if (!runs.some(run => run.status === 'COMPLETED')) throw new Error('No completed OCR run found after reopening');
if (!ledgerEntry) throw new Error('Approved application is missing from the ledger');
if (!Array.isArray(reopened.fields) || reopened.fields.length === 0) throw new Error('OCR fields were not persisted');

console.log(JSON.stringify({
  ok: true,
  applicationId: application.id,
  projectId: reopened.projectId,
  status: reopened.status,
  ocrBlocks: Array.isArray(ocr.blocks) ? ocr.blocks.length : 0,
  persistedFields: reopened.fields.length,
  completedOcrRuns: runs.filter(run => run.status === 'COMPLETED').length,
  ledgerId: ledgerEntry.id,
}, null, 2));
