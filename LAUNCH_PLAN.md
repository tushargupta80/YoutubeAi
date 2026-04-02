## Startup Launch Roadmap

This roadmap turns the current deployment work into a practical launch sequence for the product.

### Current state

- Local development: ready
- Private staging/beta: ready
- Public paid launch: close, but still depends on final hosted environment setup

The core product and repo-side operational work are now in place. The remaining work is mostly production environment configuration, hosted monitoring, and platform-specific scaling.

## Phase 1: Production Foundation

Goal: deploy a safe production environment that can handle a small private beta.

### Must complete

- Set production secrets:
  - `AUTH_SECRET`
  - `DATABASE_URL`
  - `REDIS_URL`
  - `GEMINI_API_KEY`
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
- Use managed Postgres and Redis
- Deploy frontend, backend API, and workers as separate services
- Lock `CORS_ALLOWED_ORIGINS` to the real frontend domain
- Verify production cookie and network settings:
  - `AUTH_COOKIE_SECURE=true`
  - `AUTH_COOKIE_SAME_SITE`
  - `AUTH_COOKIE_DOMAIN`
  - `DB_SSL=true`
  - `TRUST_PROXY=true`
- Confirm billing works with real Razorpay test/live keys
- Run the production smoke test successfully

### Commands

```powershell
npm run secrets:auth
npm run smoke:production
npm run observability:prometheus
```

### Exit criteria

- Production deploy is online
- Login, refresh, note generation, cancel job, admin access, logout all work
- Credits and payment flow work
- Notes generation uses production services, not localhost defaults

## Phase 2: Private Beta

Goal: launch safely to the first 25-100 users.

### Must complete

- Connect metrics into real monitoring
- Add alerts for:
  - worker failures
  - queue backlog
  - dead letters
  - high note-generation latency
  - payment failures
- Set worker scaling thresholds using the autoscaling hints
- Verify refunds/credit restoration for failed or canceled jobs
- Test admin workflows for replay, recovery, and user credit issues
- Rehearse the backup/restore and secret-rotation runbooks once before launch

### Recommended checks

```powershell
npm run autoscaling:hints
npm run benchmark:providers
npm run load:generate-notes
```

### Exit criteria

- You can recover from failures without guessing
- You can observe queue health and provider latency
- You can support real users without manual DB patching

## Phase 3: First Paying Users

Goal: support a small paid user base reliably.

### Must complete

- Run realistic load tests with concurrent note-generation traffic
- Estimate cost per generated note and per paid user
- Tune worker concurrency and queue thresholds
- Add duplicate-payment and webhook-failure handling checks
- Review subscription and credit edge cases:
  - failed payment
  - canceled payment
  - duplicate webhook
  - refund mismatch
  - insufficient credit behavior
- Add support playbooks for:
  - payment complaints
  - missing credits
  - failed jobs
  - revoked sessions

### Business checkpoints

- Measure activation:
  - signup to first note generated
- Measure retention:
  - users returning within 7 days
- Measure monetization:
  - free to paid conversion
- Measure unit economics:
  - average revenue per user vs AI cost

### Exit criteria

- Product works for real paying users
- Cost is understood and bounded
- Support burden is manageable

## Phase 4: Scale to 100-1000 Users

Goal: scale carefully without breaking reliability or margins.

### Must complete

- Turn autoscaling hints into platform-specific autoscaling rules
- Separate worker roles cleanly by queue in production
- Add external observability stack:
  - Prometheus / Grafana
  - Datadog
  - OpenTelemetry
  - similar managed stack
- Track provider latency trends over time
- Add stronger queue replay safeguards
- Re-run load tests after every major model or infra change

### Important note

Do not optimize for 1000 users before you have:

- strong retention
- known acquisition path
- stable payment flow
- predictable AI cost

## Practical priority order

1. Production secrets and managed infra
2. Separate deploys for frontend, API, and workers
3. Smoke test and billing verification
4. Monitoring, alerts, and runbook rehearsal
5. Load testing and scaling rules
6. Paid launch

## Recommended launch gates

### Safe for staging

- production-like deployment works
- smoke test passes

### Safe for private beta

- backups and rotations are documented and rehearsed
- alerts exist
- admin recovery tools are tested

### Safe for paid launch

- Razorpay billing is verified
- load test results are acceptable
- credit/refund edge cases are handled
- support workflows are written down

## Immediate next steps

1. Finish Phase 1 completely.
2. Run a private beta with a small group of users.
3. Measure usage, note quality, and cost before trying to scale fast.

## Related files

- [DEPLOYMENT_READINESS.md](/c:/AI%20notes/DEPLOYMENT_READINESS.md)
- [infra/SECRETS.md](/c:/AI%20notes/infra/SECRETS.md)
- [infra/BACKUP_RESTORE.md](/c:/AI%20notes/infra/BACKUP_RESTORE.md)
- [infra/SECRET_ROTATION.md](/c:/AI%20notes/infra/SECRET_ROTATION.md)
- [infra/README.md](/c:/AI%20notes/infra/README.md)
