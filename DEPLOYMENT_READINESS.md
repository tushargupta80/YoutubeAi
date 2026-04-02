# Deployment Readiness Checklist

## Current status

This project is now staging-ready and close to a private beta launch. Core auth hardening, refresh-session rotation, session visibility, dead-letter capture and replay, worker concurrency controls, observability export, deploy verification, hosted-infra compose support, and operational runbooks are in place. The remaining work is mostly environment-specific production setup rather than missing repo implementation.

## Completed hardening

- Frontend auth has been moved away from active localStorage session dependence and now uses secure HttpOnly cookies.
- Access sessions are short-lived and can be silently renewed through rotating refresh cookies backed by Postgres.
- Session revocation is supported through DB-backed refresh-session invalidation and `session_version` checks.
- User and admin UI now expose refresh-session visibility and selective revocation.
- Failed worker jobs are now archived into a dead-letter table for recovery analysis.
- Admin tooling now supports dead-letter replay for recovery.
- Worker concurrency is now environment-driven per queue.
- A production smoke test now verifies login, refresh, generate-notes, cancel-job, admin access, and logout.
- Basic external log shipping is now supported through an optional log sink URL.
- Prometheus-style metrics export is now available at `/api/settings/metrics.prom`.
- Autoscaling guidance and provider-latency summaries are now exposed in the admin overview and terminal scripts.
- Concept extraction now prefers Gemini in production-capable environments, with Ollama kept as a fallback instead of the primary preprocessing path.
- A production secrets runbook now exists in `infra/SECRETS.md`.
- Backup and restore runbooks now exist in `infra/BACKUP_RESTORE.md`.
- Secret rotation steps now exist in `infra/SECRET_ROTATION.md`.
- A hosted-infra compose path now exists in `docker-compose.hosted.yml`.
- Local Docker Redis now uses `maxmemory-policy noeviction` through `docker/redis.conf`.

## Remaining must-fix items before production

- Set real production-only secrets for `AUTH_SECRET`, database, Redis, Razorpay, and provider keys.
  See `infra/SECRETS.md`.
- Use managed Postgres and managed Redis in the final hosted environment.
- Deploy frontend, API, and workers as separate hosted services.
- Lock CORS to real production origins only.
- Verify cookie settings for your final domain, HTTPS, and proxy setup.
- Confirm `DB_SSL` and `TRUST_PROXY` are set correctly in production.
- Hook metrics export into your real monitoring stack.
- Define platform-specific scaling thresholds and alerts from the autoscaling hints.
- Run the production smoke test successfully against the real hosted deployment.

## Recommended next fixes

- Add per-device naming and session metadata enrichment in the user account UI.
- Add external metrics export to Prometheus, Datadog, OpenTelemetry, or another managed sink.
- Turn autoscaling hints into provider-specific rules on Render, Fly, Railway, Kubernetes, or your target platform.
- Add replay safety policies for dead-letter recovery to prevent accidental duplicate work.
- Run scheduled latency benchmarks and store trend history outside the app.

## Deployment shape

- Frontend: separate hosted service.
- Backend API: separate hosted service.
- Workers: separate hosted services for ingest, embed, notes, and QA.
- Postgres: managed.
- Redis: managed.
- Gemini: primary hosted provider for note generation and concept extraction.
- Ollama: optional local or cost-controlled fallback, not the default production preprocessing path.

## Production smoke test

A deploy verification script is available at `scripts/smoke-production.mjs`.

Run it with:

```bash
npm run smoke:production
```

Useful environment variables:

```env
SMOKE_API_URL=https://your-api.example.com
SMOKE_USER_NAME=Smoke Test User
SMOKE_USER_EMAIL=smoke@example.com
SMOKE_USER_PASSWORD=ReplaceMe123!
SMOKE_YOUTUBE_URL=https://www.youtube.com/watch?v=dQw4w9WgXcQ
SMOKE_ADMIN_EMAIL=admin@example.com
SMOKE_ADMIN_PASSWORD=ReplaceAdmin123!
SMOKE_SKIP_ADMIN=false
```

The script verifies:

- user registration
- cookie-backed auth via `/api/auth/me`
- refresh rotation via `/api/auth/refresh`
- note generation
- job cancellation
- admin login and `/api/admin/overview`
- logout

### Local smoke-test notes

- If you do not want to verify admin in a local run, set `SMOKE_SKIP_ADMIN=true`.
- If you do want to verify admin, `SMOKE_ADMIN_EMAIL` must be a real registered user email, not just a name or domain.
- That admin user must either have role `admin` in the database or be included in `ADMIN_EMAILS` before registration.
- A successful local user-flow run already proves the cookie auth, refresh flow, generation, cancellation, and logout paths are healthy.

## Operational scripts

Useful support scripts now included:

- `npm run secrets:auth`
  - generates a strong random value suitable for `AUTH_SECRET`
- `npm run observability:export`
  - fetches `/api/settings/observability` and prints it or forwards it to a sink URL
- `npm run observability:prometheus`
  - logs in with `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD`, then exports Prometheus-style metrics from `/api/settings/metrics.prom`
- `npm run load:generate-notes`
  - runs a lightweight concurrency script for generate-notes and cancel-job flows
- `npm run autoscaling:hints`
  - logs queue pressure and recommended worker instance counts from the admin overview
- `npm run benchmark:providers`
  - prints provider latency summaries based on recorded AI provider events

## Launch gate

Treat the project as:

- Local development: ready
- Private staging/beta: ready
- Public production launch: close, but only after the remaining environment-specific items above are completed
