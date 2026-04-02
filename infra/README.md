# Infra Notes

This folder contains production-oriented deployment scaffolding for the current repo.

## Files

- `env.production.example`
  - baseline environment variables for hosted backend and worker deployments
- `render.yaml`
  - example Render blueprint with:
    - Next.js frontend service
    - backend API service
    - separate worker services for ingest, embed, notes, and Q&A
    - managed Postgres
    - managed Redis
- `SECRETS.md`
  - production secret setup runbook for auth, database, Redis, and provider keys
- `BACKUP_RESTORE.md`
  - backup and recovery runbook for Postgres, Redis, and worker recovery
- `SECRET_ROTATION.md`
  - operational secret rotation runbook for auth, providers, billing, DB, and Redis

## Recommended deployment shape

1. Deploy the frontend separately from the backend API.
2. Deploy dedicated worker services per role:
   - ingest
   - embed
   - notes
   - qa
3. Use managed Postgres and managed Redis.
4. Keep Gemini as the primary generation provider in production.
5. Treat Ollama as optional unless you are intentionally provisioning it yourself.

## Important notes

- The repo-root `Dockerfile.api` and `Dockerfile.worker` are intended for hosted API/worker deployments.
- `Dockerfile.worker` supports `WORKER_ENTRY` so one image can boot a specific worker role.
- `docker-compose.yml` remains the local-infra stack and starts local Postgres and Redis.
- `docker-compose.hosted.yml` is the hosted-infra stack and expects Supabase or another managed Postgres plus hosted Redis.
- If you deploy on a provider other than Render, use this folder as the template for your own platform-specific files.
- If your production database requires SSL, keep `DB_SSL=true`.
- If frontend and backend are on different origins, cookie auth should usually use `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=none`, and a domain that matches your final deployment plan.
- Worker concurrency is now env-driven per queue, so start conservatively and tune with real queue backlog and latency data.
- Failed worker jobs are archived into `queue_dead_letters`, and admin tooling now supports replaying them.
- Prometheus-style metrics are available from `/api/settings/metrics.prom` for external scraping.
- The current vector store still uses PostgreSQL JSONB embeddings. `pgvector` remains a later optimization.
- Production secrets should live in your hosting platform secret manager, not in committed `.env` files.
- For queue reliability, Redis should use `maxmemory-policy noeviction`.

## Local vs hosted compose

Local-infra mode:

```bash
docker compose up --build
```

Hosted-infra mode with Supabase and hosted Redis:

```bash
docker compose -f docker-compose.hosted.yml up --build
```

## Verification

After deployment, run the smoke test from the repo root:

```bash
npm run smoke:production
```

Set these as needed:

```env
SMOKE_API_URL=https://your-api.example.com
SMOKE_ADMIN_EMAIL=admin@example.com
SMOKE_ADMIN_PASSWORD=replace_me
SMOKE_SKIP_ADMIN=false
```

You can also export observability snapshots:

```bash
npm run observability:export
npm run observability:prometheus
```

And run operational analysis scripts:

```bash
npm run load:generate-notes
npm run autoscaling:hints
npm run benchmark:providers
```

## Suggested next production step

If you continue past this phase, the next infrastructure-focused work would be:

- provider-managed secrets setup
- platform-specific autoscaling rules
- external observability export to Prometheus, Datadog, OpenTelemetry, or another managed sink
- rollout strategies for independent worker services
- dead-letter replay safeguards and recovery policies
