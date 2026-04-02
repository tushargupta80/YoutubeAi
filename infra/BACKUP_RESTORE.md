# Backup and Restore Runbook

## Goal

Recover safely from production data loss or corruption affecting PostgreSQL or Redis.

## Scope

This runbook covers:

- Supabase or managed PostgreSQL backups and restores
- managed Redis backup/recovery expectations
- application-side precautions before and after restore

## PostgreSQL backup strategy

### Recommended production approach

Use provider-managed automated backups first.

For Supabase or another managed Postgres provider:

1. Enable daily automated backups.
2. Confirm retention window.
3. Confirm point-in-time recovery availability if your plan supports it.
4. Restrict restore access to trusted operators only.

### Manual logical backup

Run from a trusted machine with network access to production Postgres:

```bash
pg_dump --format=custom --no-owner --no-privileges --dbname "$DATABASE_URL" --file backup.dump
```

Recommended cadence:

- daily for active production systems
- before major migrations
- before large data cleanup jobs

Store backups in:

- cloud object storage
- encrypted backup vault
- not on a developer laptop only

## PostgreSQL restore process

### Before restore

1. Put the app in maintenance mode if possible.
2. Pause workers so no new jobs mutate state.
3. Confirm whether you need full restore or targeted recovery.
4. Snapshot current damaged state if possible before overwriting it.

### Full restore to a fresh database

Preferred approach:

1. Provision a fresh Postgres instance.
2. Restore backup into the fresh instance.
3. Point the app to the restored DB.
4. Run smoke checks.
5. Resume workers.

Restore command example:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$RESTORE_DATABASE_URL" backup.dump
```

### After restore

Run:

```bash
npm run smoke:production
```

Then validate:

- user login
- admin overview
- queue state
- note generation
- billing balances
- dead-letter visibility

## Redis backup strategy

Redis in this app is operational state for queues and transient coordination, not the primary source of record.

### Recommended production approach

Use a managed Redis provider with:

- persistence enabled where available
- `maxmemory-policy noeviction`
- backup or snapshot support if your provider offers it

### Important note

Redis should not be treated as the only durable source for user data.

Primary records remain in PostgreSQL.

## Redis restore / recovery process

### Queue-focused recovery

If Redis is lost:

1. Restore Redis from provider backup if available.
2. If no backup exists, recreate Redis.
3. Start backend and workers.
4. Let worker startup reconciliation inspect unfinished jobs.
5. Review `queue_dead_letters` and replay only safe failed jobs.

### After Redis recovery

Validate:

- backend boots
- workers connect
- queues accept new jobs
- dead-letter replay works
- no runaway duplicate work is occurring

## Worker recovery after restore

After either DB or Redis recovery:

1. Start backend first.
2. Start workers after backend health is good.
3. Review logs for reconciliation errors.
4. Review dead letters before bulk replay.
5. Replay only the jobs that are safe to retry.

## Recovery checklist

1. Stop writes or enter maintenance mode.
2. Identify whether DB, Redis, or both are affected.
3. Restore the primary system.
4. Reconnect backend.
5. Reconnect workers.
6. Run smoke test.
7. Review admin overview, failed jobs, and dead letters.
8. Resume normal traffic.

## Launch requirement

Before public launch, verify you can answer all of these:

- Where is the latest Postgres backup?
- Who can restore it?
- How long does restore take?
- How do you pause workers safely?
- How do you recover Redis queue state?
- How do you verify replay safety after recovery?
