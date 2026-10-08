export function databaseUrl(value: string) {
  const url = new URL(value);
  for (const [key, fallback] of Object.entries({ connection_limit: '3', pool_timeout: '15', connect_timeout: '10' })) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, fallback);
  }
  return url.href;
}
