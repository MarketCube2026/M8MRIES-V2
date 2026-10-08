import { createClient } from '@supabase/supabase-js';
import { requestJson } from './http-request';
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
export type ApiNotice = { key: string; message: string };
async function request(targetBase: string, path: string, init?: RequestInit, timeoutMs?: number) {
  const requestKey = targetBase + path;
  try {
    const session = await auth?.auth.getSession();
    const headers = new Headers(init?.headers);
    if (session?.data.session) headers.set('Authorization', 'Bearer ' + session.data.session.access_token);
    headers.delete('x-role');
    const data = await requestJson(requestKey, { ...init, headers }, timeoutMs);
    window.dispatchEvent(new CustomEvent<ApiNotice>('api-recovered', { detail: { key: requestKey, message: '' } }));
    return data;
  } catch (error) {
    if (!init?.signal?.aborted) {
      const message = error instanceof Error ? error.message : '请求失败，请重试';
      window.dispatchEvent(new CustomEvent<ApiNotice>('api-error', { detail: { key: requestKey, message } }));
    }
    throw error;
  }
}
export function api(path: string, init?: RequestInit) {
  return request(base, path, init);
}
export function ocrApi(path: string, init?: RequestInit) {
  return request(configuredOcrBase || base, path, init, 300000);
}
