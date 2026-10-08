import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from './app';
import { readConfig } from './config';
import { databaseUrl } from './database-url';
import { applicationListSelect } from './application-list-query';

let server: Server, base: string;
const findMany = vi.fn(async (_args: unknown) => []);
let role = 'APPROVER';
beforeAll(async () => {
  const config = readConfig({ DATABASE_URL: 'postgresql://test-only:test-only@localhost/test',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only-not-a-real-key',
    OCR_SERVICE_TOKEN: 'test-only-not-a-real-ocr-token', FRONTEND_ORIGIN: 'https://example.test' });
  const app = createApp({ config, storage: {}, prisma: { application: { findMany },
    userAccess: { findUnique: async () => ({ active: true, role }) } },
    supabase: { auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) } } });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
beforeEach(() => { findMany.mockClear(); role = 'APPROVER'; });
describe('read-only application summaries', () => {
  it('uses compact selections for lists without changing the record count or permissions', async () => {
    const response = await fetch(base + '/api/applications?view=list', { headers: { authorization: 'Bearer test-only' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(findMany.mock.calls[0][0]).toEqual({ where: {}, select: applicationListSelect, orderBy: { updatedAt: 'desc' } });
    expect(applicationListSelect).not.toHaveProperty('originalSnapshot');
    expect(applicationListSelect).not.toHaveProperty('scores');
    expect(applicationListSelect).not.toHaveProperty('attachments');
    expect(applicationListSelect.fields.select).not.toHaveProperty('sourceText');
  });
  it('preserves the full API contract for callers without view=list', async () => {
    await fetch(base + '/api/applications', { headers: { authorization: 'Bearer test-only' } });
    expect(findMany.mock.calls[0][0]).toHaveProperty('include.scores', true);
    expect(findMany.mock.calls[0][0]).not.toHaveProperty('select');
  });
  it('retains owner scope for applicants', async () => {
    role = 'APPLICANT';
    await fetch(base + '/api/applications?view=list', { headers: { authorization: 'Bearer test-only' } });
    expect(findMany.mock.calls[0][0]).toHaveProperty('where.ownerId', 'test-user');
  });
  it('sets bounded pool defaults without changing credentials, database or configured overrides', () => {
    const original = 'postgresql://test-only:test-only@localhost:5432/test?sslmode=require';
    const parsed = new URL(databaseUrl(original));
    expect(parsed.username).toBe('test-only');
    expect(parsed.pathname).toBe('/test');
    expect(parsed.searchParams.get('sslmode')).toBe('require');
    expect(parsed.searchParams.get('connection_limit')).toBe('3');
    expect(parsed.searchParams.get('pool_timeout')).toBe('15');
    expect(parsed.searchParams.get('connect_timeout')).toBe('10');
    const overridden = new URL(databaseUrl(original + '&connection_limit=2&pool_timeout=7&connect_timeout=5'));
    expect(overridden.searchParams.get('connection_limit')).toBe('2');
    expect(overridden.searchParams.get('pool_timeout')).toBe('7');
    expect(overridden.searchParams.get('connect_timeout')).toBe('5');
  });
});
