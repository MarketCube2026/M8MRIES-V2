const API_ORIGIN = 'https://api.trialmatch.xin';

export async function onRequest({ request, params }) {
  const incomingUrl = new URL(request.url);
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const upstreamUrl = new URL(`/api/${path}`, API_ORIGIN);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', 'https');

  const controller = new AbortController();
  const read = ['GET', 'HEAD'].includes(request.method);
  const timer = setTimeout(() => controller.abort(), path.endsWith('/ocr') ? 300000 : read ? 18000 : 55000);
  const errorResponse = (error, status) => Response.json({ error }, {
    status, headers: { 'cache-control': 'no-store' },
  });
  try {
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status !== 204 && request.method !== 'HEAD' &&
        !response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      return errorResponse('后端暂未返回有效的接口数据，请稍后重试', response.status >= 400 ? response.status : 502);
    }
    const responseHeaders = new Headers(response.headers);
    for (const name of [...responseHeaders.keys()]) {
      if (name.toLowerCase().startsWith('access-control-')) responseHeaders.delete(name);
    }
    responseHeaders.set('cache-control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return errorResponse(controller.signal.aborted ? '后端连接超时，请稍后重试' : '后端服务暂时不可用', controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
}
