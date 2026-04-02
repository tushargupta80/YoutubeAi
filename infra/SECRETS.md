# Production Secrets Runbook

## Goal

Set production-only secrets for:

- `AUTH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `GEMINI_API_KEY`
- any optional `OBSERVABILITY_LOG_SINK_TOKEN`

Do not reuse local development values in production.

## Required secrets

### 1. Auth signing secret

Generate a strong secret from the repo root:

```bash
npm run secrets:auth
```

Use the output as `AUTH_SECRET`.

Requirements:

- unique per environment
- at least 32 random bytes
- never committed to git
- rotate if you suspect exposure

### 2. Postgres connection string

Set a managed Postgres connection string as `DATABASE_URL`.

Example:

```env
DATABASE_URL=postgresql://app_user:strong_password@db-host:5432/youtube_notes
DB_SSL=true
```

Supabase example:

```env
DATABASE_URL=postgresql://postgres.your-project-ref:your-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
DB_SSL=true
```

Requirements:

- use a managed database in production
- use a dedicated app user, not the provider admin user if avoidable
- use strong randomly generated credentials
- keep `DB_SSL=true` unless your provider explicitly says otherwise
- if you use Supabase, prefer the connection pooler string for app traffic
- keep the password and project ref in your host secret manager, not in repo files

### 3. Redis connection string

Set a managed Redis connection string as `REDIS_URL`.

Example:

```env
REDIS_URL=redis://default:strong_password@redis-host:6379
```

Requirements:

- use managed Redis in production
- require authentication
- do not expose Redis publicly without network controls

### 4. Gemini provider key

Set your real hosted provider key:

```env
GEMINI_API_KEY=replace_me
```

Requirements:

- use a production-scoped key when possible
- set provider-side quotas, alerts, and billing controls
- rotate the key if it is ever exposed

### 5. Optional observability sink token

If you export logs externally:

```env
OBSERVABILITY_LOG_SINK_TOKEN=replace_me
```

Only set this if your log sink requires bearer auth.

## Where to store secrets

Store production secrets in your hosting platform's secret manager or environment-variable settings:

- Render dashboard secrets
- Railway variables
- Fly.io secrets
- AWS SSM / Secrets Manager
- GCP Secret Manager
- Doppler / 1Password / Vault

Do not:

- commit production secrets into `.env`, `.env.example`, or `env.production.example`
- paste secrets into docs or tickets
- reuse local/test secrets in staging or production

## Minimum production env set

At minimum, production should set:

```env
NODE_ENV=production
AUTH_SECRET=...
DATABASE_URL=...
REDIS_URL=...
DB_SSL=true
TRUST_PROXY=true
FRONTEND_URL=https://your-frontend.example.com
CORS_ALLOWED_ORIGINS=https://your-frontend.example.com
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=none
AUTH_COOKIE_DOMAIN=your-frontend.example.com
GEMINI_API_KEY=...
```

## Verification checklist

Before launch:

1. Confirm no placeholder values remain like `replace_me` or `change_me`.
2. Confirm `AUTH_SECRET` is unique for production.
3. Confirm Postgres and Redis point to managed services, not localhost.
4. Confirm `DB_SSL=true` for production.
5. Confirm the frontend origin matches `CORS_ALLOWED_ORIGINS`.
6. Confirm cookie settings match your real domain and HTTPS setup.
7. Run:

```bash
npm run smoke:production
```

## Supabase note

This project already works with Supabase because Supabase is standard PostgreSQL from the app's point of view. In practice you only need to:

1. Set `DATABASE_URL` to your Supabase Postgres connection string.
2. Keep `DB_SSL=true`.
3. Run your backend migrations against that database before launch.
4. Keep Redis separate, because Supabase does not replace Redis for your queue layer.

## Rotation note

If you rotate `AUTH_SECRET`, existing signed access tokens become invalid. Plan that change during a maintenance window or coordinated rollout.
