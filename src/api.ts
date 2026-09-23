import { createClient } from '@supabase/supabase-js';
const configuredBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const localMode = import.meta.env.VITE_LOCAL_MODE === 'true' ||
  (import.meta.env.DEV && (!import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL.includes('PROJECT.supabase.co')));
const useLocalProxy = localMode || (import.meta.env.DEV &&
  (!configuredBase || configuredBase === 'https://api.example.com'));
const base = useLocalProxy ? '' : configuredBase;
const configuredOcrBase = (import.meta.env.VITE_OCR_API_URL || '').replace(/\/$/, '');
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const auth = !localMode && url && key ? createClient(url, key) : null;
async function request(targetBase: string, path: string, init?: RequestInit) {
  const session = await auth?.auth.getSession();
  const headers = new Headers(init?.headers);
  if (session?.data.session) headers.set('Authorization', 'Bearer ' + session.data.session.access_token);
  headers.delete('x-role');
  const response = await fetch(targetBase + path, { ...init, headers });
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  let data: any = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      const message = contentType.includes('text/html')
        ? 'API 地址配置错误：服务器返回了网页而不是接口数据，请刷新后重试'
        : '接口返回了无法识别的数据';
      window.dispatchEvent(new CustomEvent('api-error', { detail: message }));
      throw new Error(message);
    }
  }
  if (!response.ok) {
    const message = data?.error || `请求失败 (HTTP ${response.status})`;
    window.dispatchEvent(new CustomEvent('api-error', { detail: message }));
    throw new Error(message);
  }
  return data;
}
export function api(path: string, init?: RequestInit) {
  return request(base, path, init);
}
export function ocrApi(path: string, init?: RequestInit) {
  return request(configuredOcrBase || base, path, init);
}
