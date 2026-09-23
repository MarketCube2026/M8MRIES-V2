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

  try {
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
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
    return Response.json({ error: '后端服务暂时不可用' }, { status: 502 });
  }
}
