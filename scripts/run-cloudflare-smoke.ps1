param(
  [string]$BaseUrl = 'https://m8mries-v2.pages.dev',
  [string]$SshTarget = 'deploy@47.114.47.164',
  [string]$SshKey = "$env:USERPROFILE\.ssh\literary_hundred_deploy",
  [string]$TestImage = 'reference\会议资源投入评估V2 案例2.png'
)

$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $SshKey)) { throw 'SSH key does not exist' }
if (!(Test-Path -LiteralPath $TestImage)) { throw 'OCR test image does not exist' }

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$testEmail = "codex-deploy-$stamp@example.invalid"
$testPassword = "Aa1$([Guid]::NewGuid().ToString('N'))"
$userId = $null

$createUser = @'
set -euo pipefail
email="$1"
password="$2"
pid="$(pgrep -f 'tsx server/index.ts' | head -1)"
env_lines="$(tr '\0' '\n' < "/proc/$pid/environ")"
supabase_url="$(printf '%s\n' "$env_lines" | sed -n 's/^SUPABASE_URL=//p' | head -1)"
service_key="$(printf '%s\n' "$env_lines" | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' | head -1)"
test -n "$supabase_url" && test -n "$service_key"
payload="$(python3 - "$email" "$password" <<'PY'
import json,sys
print(json.dumps({'email':sys.argv[1],'password':sys.argv[2],'email_confirm':True}))
PY
)"
response="$(curl -fsS -X POST "$supabase_url/auth/v1/admin/users" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" \
  -H 'content-type: application/json' --data "$payload")"
user_id="$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
access_payload="$(python3 - "$user_id" <<'PY'
import json,sys
print(json.dumps({'userId':sys.argv[1],'role':'APPROVER','active':True}))
PY
)"
curl -fsS -o /dev/null -X POST "$supabase_url/rest/v1/v2_user_access?on_conflict=userId" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" \
  -H 'content-type: application/json' -H 'Prefer: resolution=merge-duplicates' --data "$access_payload"
printf '%s' "$user_id"
'@

$deleteUser = @'
set -euo pipefail
user_id="$1"
pid="$(pgrep -f 'tsx server/index.ts' | head -1)"
env_lines="$(tr '\0' '\n' < "/proc/$pid/environ")"
supabase_url="$(printf '%s\n' "$env_lines" | sed -n 's/^SUPABASE_URL=//p' | head -1)"
service_key="$(printf '%s\n' "$env_lines" | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' | head -1)"
curl -fsS -o /dev/null -X DELETE "$supabase_url/rest/v1/v2_user_access?userId=eq.$user_id" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key"
curl -fsS -o /dev/null -X DELETE "$supabase_url/auth/v1/admin/users/$user_id" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key"
'@

try {
  $userId = ($createUser | & ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $SshKey $SshTarget "bash -s -- '$testEmail' '$testPassword'").Trim()
  if ($LASTEXITCODE -ne 0 -or $userId -notmatch '^[0-9a-f-]{36}$') { throw 'Unable to create the temporary deployment user' }
  Write-Output 'Temporary deployment user created'

  $cloudConfig = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 'https://marketcube2026.github.io/M1MRIES/cloud-config.js').Content
  $urlMatch = [regex]::Match($cloudConfig, 'supabaseUrl:\s*["'']([^"'']+)["'']')
  $keyMatch = [regex]::Match($cloudConfig, 'supabaseAnonKey:\s*["'']([^"'']+)["'']')
  if (!$urlMatch.Success -or !$keyMatch.Success) { throw 'Unable to read public Supabase configuration' }

  $env:BASE_URL = $BaseUrl
  $env:OCR_BASE_URL = 'https://api.trialmatch.xin'
  $env:SUPABASE_URL = $urlMatch.Groups[1].Value
  $env:SUPABASE_ANON_KEY = $keyMatch.Groups[1].Value
  $env:TEST_EMAIL = $testEmail
  $env:TEST_PASSWORD = $testPassword
  $env:TEST_IMAGE = (Resolve-Path -LiteralPath $TestImage).Path
  & npm.cmd run smoke:cloudflare
  if ($LASTEXITCODE -ne 0) { throw 'Cloudflare smoke test failed' }
} finally {
  Remove-Item Env:TEST_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
  if ($userId) {
    $deleteUser | & ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $SshKey $SshTarget "bash -s -- '$userId'"
    if ($LASTEXITCODE -eq 0) { Write-Output 'Temporary deployment user removed' }
  }
}
