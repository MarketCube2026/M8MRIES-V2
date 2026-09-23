# Cloudflare + ECS deployment

Production uses the following split:

- Cloudflare Pages serves the Vite frontend.
- A Pages Function proxies same-origin `/api/*` requests to the ECS API.
- Long-running OCR uploads go directly to the authenticated ECS HTTPS API because
  Cloudflare terminates a synchronous origin request after about 100 seconds.
- ECS runs the Node API and PaddleOCR. Neither service is exposed on a raw high port.
- Supabase provides Auth, PostgreSQL, and private Storage.

The proxy target is `https://api.trialmatch.xin`. It removes the browser `Origin`
header before the server-to-server request so the existing ECS CORS allowlist does
not need to trust every Pages preview domain. Authentication remains mandatory on
the Node API and is not implemented by the proxy.

## Build settings

Build the frontend with:

```text
VITE_BASE_PATH=/
VITE_API_URL=
VITE_OCR_API_URL=https://api.trialmatch.xin
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
```

Never place the database password, Supabase service-role key, OCR service token,
or DeepSeek API key in the Pages project or frontend build.

The ECS `FRONTEND_ORIGIN` allowlist must include `https://m8mries-v2.pages.dev`
for the direct OCR request. Do not use `*`; authenticated browser requests must
only be accepted from known production origins.

## Verification

After deployment verify, in order:

1. `GET /api/health` returns `{"ok":true}` through Pages.
2. An existing Supabase user can sign in.
3. Creating an application persists after refresh and a second sign-in.
4. OCR upload completes and the saved application reopens with the same fields.
5. The approval creates a ledger entry and the entry survives an API restart.

Do not replace the V1 entry point until all five checks pass.
