# Access stability deployment

The frontend is hosted at `https://m8mries-v2.pages.dev/`. For this deployment,
build it with the existing HTTPS API origin instead of the Pages Functions relay:

```text
VITE_BASE_PATH=/
VITE_API_URL=https://api.trialmatch.xin
VITE_OCR_API_URL=https://api.trialmatch.xin
VITE_LOCAL_MODE=false
```

Keep the existing public Supabase frontend configuration. Credentials for the
database, Storage and OCR remain only on ECS. The API must continue to allow the
exact frontend origin in `FRONTEND_ORIGIN` and verify Supabase bearer tokens and
server-side roles. Pages Functions remain available for compatibility, but the
frontend no longer depends on their cross-border relay for normal API requests.

Application lists use `/api/applications?view=list` and return all authorized
records with compact field values, latest approval and review IDs. Snapshots,
OCR evidence, scores and full histories remain accessible through the existing
detail endpoint. The original full-list API contract is unchanged for callers
without `view=list`. No schema or data migration is needed for this release.

Read requests have a 20-second per-attempt deadline and up to three attempts for
transient failures. Writes are never automatically replayed. On ambiguous write
failure, inspect the saved record before resubmitting. OCR retains its separate
five-minute client deadline. A successful request clears only its own error.

## Verify

- `/api/health` returns JSON 200.
- `/api/ready` returns JSON 200 and actually checks PostgreSQL.
- Unauthenticated application reads return JSON 401, not a webpage.
- Test an OPTIONS request with the Pages origin and Authorization header.
- After login, verify all applications, filtering and detail reopening.
- Verify API/OCR container health and check for Prisma P2024 errors.
- Keep the previous API image and environment backup; update only `api` with
  `docker compose up -d --no-deps api`, without recreating OCR or running migrations.

The ECS deployment maps host loopback port 4001 to container port 4000. Use the
container's own readiness check or the actual published port, not host port 4000.
Local Vite remains on port 5174 and excludes generated diagnostic/backup directories
from watching to avoid Windows EBUSY crashes.

Network latency can still fluctuate. These checks establish current availability,
not a guarantee of uninterrupted access. Do not reset the database or replace
historical data to troubleshoot a network failure.
