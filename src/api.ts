import { createClient } from '@supabase/supabase-js';
const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const auth = url && key ? createClient(url, key) : null;
export async function api(path: string, init?: RequestInit) {
  const session = await auth?.auth.getSession();
  const headers = new Headers(init?.headers);
  if (session?.data.session) headers.set('Authorization', 'Bearer ' + session.data.session.access_token);
  headers.delete('x-role');
  const response = await fetch(base + path, { ...init, headers });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const message = data.error || '请求失败';
    window.dispatchEvent(new CustomEvent('api-error', { detail: message }));
    throw new Error(message);
  }
  return data;
}
