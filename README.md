# YouTube Study Notes Generator

Production-oriented AI SaaS starter that turns YouTube lectures into study notes, flashcards, quizzes, diagrams, and video-grounded Q&A using a multi-stage RAG pipeline with Gemini, Ollama, Redis, and PostgreSQL.

## Architecture

- `frontend/`: Next.js App Router UI for auth, note generation, job polling, history, settings, diagrams, PDF export, and Q&A.
- `backend/`: Express API for auth, job orchestration, persistence, admin endpoints, settings, diagnostics, observability, and queue handoff.
- `workers/`: BullMQ worker runtime with separate queue stages for ingest, embeddings, notes generation, and Q&A, plus role-specific worker entrypoints for independent deployment.
- `ai_pipeline/`: Transcript extraction, chunking, embeddings, retrieval, prompt building, Gemini generation, and Ollama preprocessing helpers.
- `database/`: PostgreSQL schema and migrations.
- `backend/services/`: repositories, queue wiring, vector-store abstraction, question service, provider telemetry, request-log persistence, observability metrics, tracing, and RAG orchestration.

## Current Pipeline Flow

1. User submits a YouTube URL from the frontend.
2. Backend creates a `note_jobs` row and enqueues the ingest stage in Redis.
3. `notes-ingest` worker extracts the transcript, normalizes it, and stores transcript text plus `transcript_items` in PostgreSQL.
4. `notes-embed` worker chunks the transcript, creates embeddings, and stores vector chunks through the shared vector-store abstraction.
5. `notes-generation` worker retrieves high-signal context, extracts concepts, and asks Gemini for final structured notes.
6. Backend stores markdown, JSON notes, flashcards, quiz output, provider metadata, and processing time.
7. Frontend polls job status and renders full-width notes, diagrams, history, and Q&A.
8. `notes-qa` worker answers follow-up questions against the stored lecture context.

## Queue Stages

Current BullMQ queues:

- `notes-ingest`: transcript extraction and transcript persistence
- `notes-embed`: chunking and embeddings
- `notes-generation`: final notes generation
- `notes-qa`: follow-up question answering

This split keeps long-running AI work off the API process and makes the heavy stages independently scalable later.

## Storage Model

- PostgreSQL stores users, roles, videos, note jobs, question logs, transcript text, `transcript_items`, vector chunks, provider events, provider circuit state, and persisted API request logs.
- Redis is used for BullMQ queues, queue event coordination, and distributed rate-limit counters.
- Gemini is the primary final-generation provider.
- Ollama is used for local preprocessing, embeddings, and selected fallback/helper tasks.
- The vector layer uses a shared abstraction with a Postgres-backed implementation today.

## Auth And API Security

- Auth uses signed bearer tokens from `backend/utils/auth.js`.
- Users now have explicit roles: `user`, `support`, `analyst`, and `admin`.
- Admin-only routes are protected server-side with role middleware.
- Request IDs are attached to every API response through `x-request-id`.
- Request logging persists path, status, latency, request ID, IP, and user ID where available.
- Rate limits are Redis-backed by default and split by route class:
  - auth
  - general API
  - admin
  - note generation
  - Q&A

## API Route Structure

Routes are now split into focused modules:

- `backend/routes/auth.routes.js`
- `backend/routes/settings.routes.js`
- `backend/routes/admin.routes.js`
- `backend/routes/notes.routes.js`
- `backend/routes/questions.routes.js`

Shared middleware lives in:

- `backend/middleware/auth.js`
- `backend/middleware/request-id.js`
- `backend/middleware/request-logger.js`
- `backend/middleware/rate-limit.js`
- `backend/middleware/error-handler.js`

## Observability

Current observability coverage includes:

- structured JSON logs with service, environment, host, and process metadata
- request IDs plus trace IDs on each request
- persisted API request logs in PostgreSQL
- in-memory route metrics for request count, latency, and error rate
- dependency health snapshots for PostgreSQL and Redis
- provider usage, retries, fallbacks, cost, and circuit-breaker events
- queue backlog and in-flight counts for ingest, embed, notes, and Q&A
- runtime diagnostics surfaced in the frontend settings panel

Endpoints:

- `GET /healthz`
- `GET /readyz`
- `GET /api/settings/diagnostics`
- `GET /api/settings/observability`

## Admin Features

Current admin tooling includes:

- admin-only overview metrics for users, jobs, provider usage, and costs
- recent request-log inspection from the UI
- role management from the UI and API
- provider usage summaries and charts
- circuit-breaker and provider-health diagnostics in runtime settings

Admin role updates are available through:

- `PATCH /api/admin/users/:userId/role`

Allowed roles are:

- `user`
- `support`
- `analyst`
- `admin`

## Environment Variables

Create `.env` files from the examples below.

### Root `.env`

Used by Docker Compose for container runtime values.

```env
DB_SSL=false
VECTOR_STORE_PROVIDER=pgvector
GEMINI_API_KEY=replace_me
GEMINI_MODEL=gemini-2.5-flash
OLLAMA_PREPROCESS_MODEL=phi3:mini
OLLAMA_FALLBACK_MODEL=phi3:mini
OLLAMA_EMBED_MODEL=nomic-embed-text
AUTH_SECRET=change_me_to_a_long_random_secret
ADMIN_EMAILS=admin@example.com
SERVICE_NAME=backend
OBSERVABILITY_METRICS_WINDOW_SIZE=1000
```

### Backend / Worker

`backend/.env`

```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/youtube_notes
REDIS_URL=redis://redis:6379
DB_SSL=false
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_CHAT_MODEL=llama3
OLLAMA_PREPROCESS_MODEL=phi3:mini
OLLAMA_FALLBACK_MODEL=phi3:mini
OLLAMA_EMBED_MODEL=nomic-embed-text
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_API_KEY=replace_me
GEMINI_MODEL=gemini-2.5-flash
VECTOR_INDEX_DIR=./data/faiss
VECTOR_STORE_PROVIDER=pgvector
PGVECTOR_ANN_ENABLED=true
PGVECTOR_ANN_INDEX_TYPE=hnsw
PGVECTOR_SEARCH_CANDIDATE_MULTIPLIER=25
PGVECTOR_HNSW_EF_SEARCH=80
PGVECTOR_IVFFLAT_PROBES=10
DEFAULT_TOP_K=6
AUTH_SECRET=change_me_to_a_long_random_secret
ADMIN_EMAILS=admin@example.com
SERVICE_NAME=backend
OBSERVABILITY_METRICS_WINDOW_SIZE=1000
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=20
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120
ADMIN_RATE_LIMIT_WINDOW_MS=60000
ADMIN_RATE_LIMIT_MAX=60
GENERATE_NOTES_RATE_LIMIT_WINDOW_MS=600000
GENERATE_NOTES_RATE_LIMIT_MAX=12
QUESTION_RATE_LIMIT_WINDOW_MS=300000
QUESTION_RATE_LIMIT_MAX=40
```

### Frontend

`frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Deployment Files

Production-oriented deployment scaffolding now lives in:

- `Dockerfile.api`
- `Dockerfile.worker`
- `infra/render.yaml`
- `infra/env.production.example`
- `infra/README.md`

`Dockerfile.worker` supports `WORKER_ENTRY`, so the same image can boot `ingest.worker.js`, `embed.worker.js`, `notes.worker.js`, or `qa.worker.js` in production. Use `docker-compose.yml` for local development, and use the files above as the base for hosted deployments.

## Run Locally

```bash
docker compose up --build
```

App URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

Useful health checks:

```bash
curl http://localhost:4000/healthz
curl http://localhost:4000/readyz
curl http://localhost:4000/api/settings/observability
```

## Tests

Backend resilience and middleware tests:

```bash
npm run test:backend
```

## Current Production-Oriented Improvements

Already implemented in this repo:

- startup migrations with version tracking
- health and readiness endpoints
- graceful backend shutdown
- multi-stage BullMQ pipeline
- Postgres-backed shared vector storage
- transcript item persistence in PostgreSQL
- optional `pgvector` support when the `vector` extension is available
- HNSW-based pgvector ANN indexing plus search tuning envs for larger vector corpora
- user auth with role support and per-user job/history scoping
- request IDs, trace IDs, request logging, route-specific Redis-backed rate limiting, and centralized API error handling
- runtime settings, diagnostics, and observability snapshots
- admin overview page with role management and request-log visibility
- provider metrics, provider event persistence, token/cost tracking, and circuit breaker state
- queue backlog visibility for the worker pipeline
- role-specific worker entrypoints for deployable worker services
- provider and processing-time metadata in generated results
- backend automated tests for provider resilience and middleware behavior

## Notes

- Admin access is controlled by `ADMIN_EMAILS`. Matching emails are created as `admin`; other users default to `user`.
- Admin users can later promote or demote other accounts through the admin UI/API.
- If an already signed-in user loses admin privileges, the frontend refreshes their session role and hides admin panels automatically.
- Gemini model names and Ollama model names are env-driven so deployments can switch providers and local models safely.
- Recommended local Ollama split on CPU-only machines: `phi3:mini` for preprocessing and fallback, `nomic-embed-text` for embeddings.
- The vector layer now supports an optional `pgvector` path when the `vector` extension is available. If it is not available, the app safely falls back to JSONB embeddings plus application-side similarity.

## Deferred Work (Phases 1-9)

These items are intentionally deferred after the core production refactor path.

### Phase 2

- `backend/services/vector-store.postgres.js`
  - optional `pgvector` support is now in place; remaining work is workload-specific index tuning and benchmarking
- `backend/services/vector-store.js`
  - add clearer production provider support for `pgvector`, Qdrant, or Pinecone
- `database/schema.sql`
  - add `pgvector` extension and vector column if we move beyond JSONB embeddings
- `backend/services/rag.service.js`
  - add better retrieval caching and reuse for repeated videos

### Phase 3

- `workers/worker.js`
  - combined local worker entrypoint remains for development; production worker role split is already available via dedicated entry files
- `workers/tasks`
  - add dead-letter handling and queue-specific retry policies
- `backend/services/queue.js`
  - add queue metrics helpers and per-queue backoff tuning
- `backend/services/question.service.js`
  - improve Q&A timeout and fallback handling
- `backend/services/rag.service.js`
  - add richer stage telemetry and caching
- `backend/services/notes.repository.js`
  - improve pagination and filtering for larger job histories

### Phase 4

- stronger query tuning once production traffic patterns are known
- broader dedup/reuse policy decisions across tenants if needed

### Phase 5

- persist richer billing-grade usage accounting if exact provider billing matters
- add more advanced charts/dashboards if you want long-term ops reporting

### Phase 6

- more granular permissions within non-admin roles if support/analyst capabilities diverge
- external observability sink integration if you want logs shipped beyond PostgreSQL

### Phase 8

- export observability data to Prometheus, Datadog, OpenTelemetry, or another external sink
- persist worker-process-specific runtime metrics beyond queue counts
- add alerting thresholds and notification hooks for queue backlog, dependency failure, or provider instability

### Phase 9

- platform-specific deploy manifests beyond the included Render blueprint
- managed secret provisioning and rotation runbooks
- autoscaling and worker rollout rules per environment
- production worker role split into separate deployable services

### Biggest Deferred Architecture Items

- `backend/services/vector-store.postgres.js`
  - keep tuning ANN parameters and benchmark recall/latency under production workloads
- `workers/worker.js`
  - keep the combined local/dev worker entrypoint while production deploys use dedicated worker services
- deployment infra
  - move managed Postgres, Redis, object storage, and scalable worker deployments out of local Docker assumptions
