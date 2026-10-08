const transientStatuses = new Set([408, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);

class RequestError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}

function pause(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

// Only reads may be replayed: a failed write may already have committed on the server.
export async function requestJson(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<any> {
  const method = (init.method || 'GET').toUpperCase();
  const read = method === 'GET' || method === 'HEAD';
  const attempts = read ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    init.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? (read ? 20000 : 60000));
    let failure: RequestError;
    try {
      const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
      if (response.status === 204 || (method === 'HEAD' && response.ok)) return null;
      const body = await response.text();
      let data: any;
      try { data = JSON.parse(body); } catch {
        if (!response.ok) throw new RequestError(`服务暂时不可用 (HTTP ${response.status})，请稍后重试`, transientStatuses.has(response.status));
        throw new RequestError(response.headers.get('content-type')?.includes('text/html')
          ? '接口返回了网页，请联系管理员检查 API 路径配置'
          : '接口返回格式异常，请重试');
      }
      if (!response.ok) throw new RequestError(typeof data?.error === 'string' ? data.error : `请求失败 (HTTP ${response.status})`, transientStatuses.has(response.status));
      return data;
    } catch (error) {
      init.signal?.throwIfAborted();
      failure = error instanceof RequestError ? error : new RequestError(!read
        ? '未能确认提交结果，请先刷新检查记录，避免重复提交'
        : controller.signal.aborted ? '请求超时，请检查网络后重试' : '网络连接失败，请检查网络后重试', true);
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
    }
    if (!failure.retryable || attempt + 1 >= attempts) throw failure;
    await pause(500 * (attempt + 1), init.signal);
  }
}
