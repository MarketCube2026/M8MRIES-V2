import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from './http-request';
import { api, type ApiNotice } from './api';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: null } }),
} }) }));
const json = (data: unknown, status = 200) => Response.json(data, { status });
const html = (status = 502) => new Response('<html>Unavailable</html>', { status, headers: { 'content-type': 'text/html' } });
const fetchMock = vi.fn<typeof fetch>();
async function settle<T>(operation: Promise<T>) {
  const result = operation.then(value => ({ value, error: null }), error => ({ value: null, error }));
  await vi.runAllTimersAsync();
  return result;
}
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('bounded API reads', () => {
  it.each([408, 500, 502, 503, 504, 522, 524])('recovers from HTTP %s without exposing HTML', async status => {
    fetchMock.mockResolvedValueOnce(html(status)).mockResolvedValueOnce(json([{ id: '1' }]));
    expect((await settle(requestJson('/api/applications'))).value).toEqual([{ id: '1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.cache).toBe('no-store');
  });
  it('retries network failure then recovers', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json([]));
    expect((await settle(requestJson('/api/applications'))).value).toEqual([]);
  });
  it('stops after three failed attempts with a service error, not a configuration error', async () => {
    fetchMock.mockImplementation(async () => html());
    const result = await settle(requestJson('/api/applications'));
    expect(result.error.message).toContain('HTTP 502');
    expect(result.error.message).not.toContain('配置');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each([401, 403, 404, 429])('does not retry HTTP %s', async status => {
    fetchMock.mockResolvedValue(json({ error: 'Denied' }, status));
    expect((await settle(requestJson('/api/applications'))).error.message).toBe('Denied');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects an HTML success response without concealing a path configuration error', async () => {
    fetchMock.mockResolvedValue(html(200));
    expect((await settle(requestJson('/api/applications'))).error.message).toContain('API 路径配置');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['POST', 'PATCH', 'DELETE'])('never replays %s on service failure', async method => {
    fetchMock.mockResolvedValue(html());
    expect((await settle(requestJson('/api/applications', { method }))).error).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('warns about unconfirmed writes on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect((await settle(requestJson('/api/applications', { method: 'POST' }))).error.message).toContain('避免重复提交');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('bounds hung reads and retries timeouts', async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    expect((await settle(requestJson('/api/applications', {}, 20))).error.message).toContain('请求超时');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('cancels during the retry delay without making another request', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(html());
    const result = requestJson('/api/applications', { signal: controller.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect((await result).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('supports a successful no-content write', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect((await settle(requestJson('/api/applications/1', { method: 'DELETE' }))).value).toBeNull();
  });
});

describe('API error notifications', () => {
  it('emits no error for a recovered transient failure', async () => {
    const failed = vi.fn(), recovered = vi.fn();
    window.addEventListener('api-error', failed);
    window.addEventListener('api-recovered', recovered);
    fetchMock.mockResolvedValueOnce(html()).mockResolvedValueOnce(json([]));
    await settle(api('/api/applications'));
    expect(failed).not.toHaveBeenCalled();
    expect((recovered.mock.calls[0][0] as CustomEvent<ApiNotice>).detail.key).toContain('/api/applications');
  });
  it('keys failures and recovery to the same resource, and removes x-role', async () => {
    const failed = vi.fn(), recovered = vi.fn();
    window.addEventListener('api-error', failed);
    window.addEventListener('api-recovered', recovered);
    fetchMock.mockResolvedValue(json({ error: 'Denied' }, 403));
    await settle(api('/api/me', { headers: { 'x-role': 'APPROVER' } }));
    fetchMock.mockResolvedValue(json({ role: 'APPROVER' }));
    await settle(api('/api/me'));
    expect(failed.mock.calls[0][0].detail.key).toBe(recovered.mock.calls[0][0].detail.key);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('x-role')).toBe(false);
  });
  it('does not show errors for cancelled navigation', async () => {
    const controller = new AbortController(), failed = vi.fn();
    window.addEventListener('api-error', failed);
    controller.abort();
    await settle(api('/api/applications', { signal: controller.signal }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });
});
