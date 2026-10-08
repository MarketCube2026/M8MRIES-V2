import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]].js';

const fetchMock = vi.fn();
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const context = (method = 'GET') => ({
  request: new Request('https://m8mries-v2.pages.dev/api/applications?status=APPROVED', {
    method, headers: { authorization: 'Bearer test-only', origin: 'https://m8mries-v2.pages.dev' },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: 'test-only' }),
  }), params: { path: ['applications'] },
});
describe('Pages API proxy', () => {
  it('preserves query and authorization and disables cache', async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    const response = await onRequest(context());
    expect(fetchMock.mock.calls[0][0].href).toBe('https://api.trialmatch.xin/api/applications?status=APPROVED');
    expect(fetchMock.mock.calls[0][1].headers.get('authorization')).toBe('Bearer test-only');
    expect(fetchMock.mock.calls[0][1].headers.has('origin')).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual([]);
  });
  it.each([200, 302, 502, 503])('normalizes upstream HTML/redirect status %s to JSON', async status => {
    fetchMock.mockResolvedValue(new Response('<html>upstream error</html>', { status, headers: { 'content-type': 'text/html' } }));
    const response = await onRequest(context());
    expect(response.status).toBe(status >= 400 ? status : 502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).error).toContain('有效的接口数据');
  });
  it('preserves JSON authentication failures', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const response = await onRequest(context());
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Unauthorized');
  });
  it('returns a bounded JSON timeout', async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const result = onRequest(context());
    await vi.advanceTimersByTimeAsync(18000);
    const response = await result;
    expect(response.status).toBe(504);
    expect((await response.json()).error).toContain('超时');
  });
  it('does not shorten the database save window or replay writes', async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const result = onRequest(context('POST'));
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(25000);
    expect((await result).status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
