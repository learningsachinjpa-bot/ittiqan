# Ittiqan — Enterprise Architecture Decisions

## Multi-tenancy Model
- Every row in every table has org_id — complete data isolation per organization
- Database-level row security can be added for PostgreSQL RLS (enterprise tier)
- No org can ever see another org's data — enforced at API layer AND db layer

## Authentication & Security
- JWT access tokens (60 min) + refresh tokens (30 days) — stateless, scalable
- Google OAuth via backend (token never stored client-side)
- Encrypted API keys using Fernet symmetric encryption (AES-128-CBC)
- Bcrypt password hashing (cost factor 12)
- Full audit log trail: every action recorded with user, timestamp, IP

## Scaling Path
Phase 1 (now):     Single server, Docker Compose, PostgreSQL + Redis
Phase 2 (100 orgs): Add Celery workers for background evaluation jobs
Phase 3 (1000 orgs): Kubernetes, managed PostgreSQL (RDS/Azure DB), Redis Cluster
Phase 4 (Gov):      On-premise deployment, air-gapped, Arabic UI, data residency

## Background Jobs (Evaluations & Red-Teaming)
- Evaluations run as async background tasks (asyncio now, Celery when scaled)
- WebSocket pushes real-time progress to frontend
- Job results persisted in PostgreSQL — never lost if connection drops

## LLM Provider Architecture
- Any LLM can be plugged in: Anthropic, OpenAI, Gemini, Mistral, Groq, Ollama
- API keys encrypted at rest, never logged
- Per-provider cost tracking and usage limits
- Organizations can use different LLMs as judge vs attacker

## Data Model Principles
- All IDs are UUIDs (not sequential integers) — safe to expose in URLs
- Soft deletes NOT used — real deletes with cascade, audit log tracks history
- JSON columns for flexible config (metrics, headers, spans) — no schema migrations needed for config changes
- Timestamps in UTC everywhere

## API Design
- RESTful with /api/v1/ prefix — versioned from day one
- WebSocket endpoints for real-time: /evaluations/{id}/ws, /security/{id}/ws
- All responses consistent: errors return {detail: "..."}
- File upload via multipart/form-data (datasets)

## What's NOT built yet (Phase 2 roadmap)
- Celery task queue (currently uses asyncio.create_task — fine for single server)
- MinIO/S3 file storage (currently datasets stored as JSON in PostgreSQL)
- PDF report generation (ReportLab installed, router not built yet)
- Email notifications (SendGrid)
- GitHub/GitLab CI webhook integration
- Arabic RTL UI
- SSO/SAML for enterprise
- Rate limiting (slowapi installed, not wired yet)
