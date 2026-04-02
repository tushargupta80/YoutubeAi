# Secret Rotation Runbook

## Goal

Rotate sensitive production secrets safely without breaking the platform unexpectedly.

## Secrets covered

- `AUTH_SECRET`
- `GEMINI_API_KEY`
- `RAZORPAY_KEY_SECRET`
- `OBSERVABILITY_LOG_SINK_TOKEN`
- database and Redis credentials when provider rotation is required

## General rotation rules

1. Rotate one secret family at a time.
2. Make changes through your hosting platform secret manager.
3. Record who rotated the secret and when.
4. Verify production health after each rotation.
5. Never store old and new secrets in git history or docs.

## AUTH_SECRET rotation

### Impact

Rotating `AUTH_SECRET` invalidates existing signed access tokens.

Refresh sessions may also fail if they rely on the old signing secret.

### Recommended process

1. Announce a short maintenance window.
2. Generate a new secret:

```bash
npm run secrets:auth
```

3. Update `AUTH_SECRET` in the hosting platform.
4. Redeploy backend and workers.
5. Ask active users to sign in again if needed.
6. Run:

```bash
npm run smoke:production
```

### Verify

- login works
- refresh works
- logout works
- admin access works

## GEMINI_API_KEY rotation

### Recommended process

1. Create a new provider key in the provider dashboard.
2. Update `GEMINI_API_KEY` in production secrets.
3. Redeploy backend and workers.
4. Verify note generation and diagnostics.

### Verify

- generate notes works
- provider telemetry shows success
- fallback behavior remains healthy

## RAZORPAY secret rotation

### Recommended process

1. Create or reveal the replacement Razorpay credentials.
2. Update:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
3. Redeploy backend.
4. Perform a test checkout and verification flow.

### Verify

- checkout opens
- payment verification succeeds
- credits are granted exactly once

## Database credential rotation

### Recommended process

1. Create a replacement DB credential in the provider dashboard.
2. Update `DATABASE_URL`.
3. Redeploy backend and workers.
4. Confirm migrations and startup succeed.

### Verify

- backend boots cleanly
- worker reconciliation works
- admin overview loads

## Redis credential rotation

### Recommended process

1. Create the replacement Redis credential.
2. Update `REDIS_URL`.
3. Redeploy backend and workers.
4. Confirm queues reconnect and jobs flow normally.

### Verify

- backend boots
- workers boot
- queue operations succeed
- no large dead-letter spike appears

## Observability token rotation

1. Update `OBSERVABILITY_LOG_SINK_TOKEN`.
2. Redeploy backend and workers.
3. Confirm logs still export successfully.

## Post-rotation checklist

After every rotation:

1. Run smoke test.
2. Check backend logs.
3. Check worker logs.
4. Check admin overview.
5. Check provider latency and failure counters.
6. Confirm no payment or auth regressions.

## Minimum audit note

For each rotation, record:

- secret name
- who rotated it
- when it was rotated
- related incident or routine reason
- deployment version used after rotation
