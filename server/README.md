# CenterAI — backend foundation (phase 1)

Architecture + working vertical slice of the API. **No PSTN, no SIP, no SIM routing, no real
calls, no recording, no billing, no production auth.** Those are separate phases.

```
Frontend (Vite/React)
   ↓  src/api/index.ts            typed client; "http" or in-browser "local" transport
CenterAI API                     server/http/router.ts  (framework-free handleApiRequest)
   ↓  server/http/middleware.ts   CORS · rate limit · body guard · auth-ready context · errors
AI Voice Orchestration Layer     server/services/index.ts (agents · voice · usage)
   ↓  server/providers/index.ts   VoiceEngine
STT / LLM / TTS providers        DemoScriptEngine  ✅   ProductionVoiceEngine  ⛔ interface only
   ↓
Telephony layer                  not implemented in this phase (capabilities report false)
   ↓
Analytics / Billing / CRM        metering only (usage_events + /api/usage + /api/analytics)
```

## Layout

| Path | Role |
|---|---|
| `shared/contracts.ts` | entities, DTOs, roles, error codes, `VoiceProvider` transport contract |
| `shared/validate.ts` | dependency-free request validation + sanitization |
| `shared/demo.ts` | canonical scripted demo scenario (client and API answer identically) |
| `server/config/env.ts` | env resolution; exposes **presence flags only**, never values |
| `server/lib/observability.ts` | structured JSON logger with secret redaction, `ApiError` |
| `server/db/schema` (`store.ts`) | `SCHEMA_SQL` + repository interfaces + in-memory implementation |
| `server/providers/index.ts` | `VoiceEngine` + `DemoScriptEngine` + `ProductionVoiceEngine` stub |
| `server/services/index.ts` | agents, voice sessions/turns, usage & analytics |
| `server/http/router.ts` | route table, `createApp()` |
| `server/http/middleware.ts` | CORS, rate limiter, body guards, auth/authorize, fetch handler |
| `server/adapters/node.ts` | `node:http` adapter (Web-standard Request/Response inside) |
| `api/index.ts` | serverless entry (Vercel/Netlify/edge) |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok", "service": "centerai-api", version, time, mode }` |
| GET | `/api/voice/capabilities` | engine + truth flags (`telephony`, `realtimeAudio`, `microphone`, `simulation`) |
| POST | `/api/voice/session` | `{ language, agentId }` → safe session DTO (no provider data) |
| POST | `/api/voice/message` | `{ sessionId, utterance? }` → next turn `{ text, phase, durationMs, done }` |
| POST | `/api/voice/end` | closes session → duration, turns, characters |
| GET | `/api/voice/messages` | `?sessionId=` transcript for the calling tenant only |
| GET | `/api/agents` · POST `/api/agents` · GET/PATCH `/api/agents/:id` | multi-agent per organization |
| GET | `/api/organizations` · `/api/users` | tenant + membership reads |
| GET | `/api/usage` · `/api/analytics` | metering aggregates (sessions, messages, AI requests, characters, audio seconds) |
| GET | `/api/config` | diagnostics: presence flags only (never secrets), dev/self-test use |

Errors are always `{ "error": { "code", "message", "fields?" } }`. Stack traces, env values and
provider payloads stay server-side (`toApiError` guarantees the shape).

## Data model (foundation)

`organizations → users → agents → voice_sessions → messages → usage_events`; every
organization-owned row and repository call carries `organizationId`. Roles seeded as
`owner · admin · manager · agent_operator · viewer`; `authorize()` enforces them once
`CENTERAI_AUTH_SECRET` turns bearer mode on (today `verifyBearer` returns `null` by design —
no half-built auth pretending to work).

## Production data & identity (this phase)

```
Frontend ──httpOnly cookie / bearer──▶ API ──▶ Services ──▶ Db (repository contract, async)
                                                             ├── memory   (Demo Mode, in-process)
                                                             └── postgres (Prisma, injected by the adapter)
```

| Concern | Detail |
|---|---|
| Schema | `prisma/schema.prisma` (+ `prisma/migrations/…/migration.sql`). Tables: `organizations, users, agents, voice_sessions, messages, usage_events`. |
| Driver choice | `server/db/store.ts` `createStore(env)` → memory for demo; adapters `await createPrismaDb()` when `APP_MODE=production` **and** `DATABASE_URL` is set. Never silently falls back to memory in production. |
| Isolation | Every `Db` method takes `organizationId`; `authenticate()` derives it from the **user row**, never from a claim, header or body. Cross-tenant ids read as 404. |
| Passwords | `bcryptjs` (12 rounds) in `server/http/auth/production.ts`. `users.getCredentialByEmail` is the only accessor for a digest; no response type carries one. |
| Tokens | `jose` HS256, `JWT_SECRET` (≥32 chars enforced), httpOnly + SameSite=Lax cookie, `Secure` in production, `jti` deny-list on logout, TTL via `AUTH_TOKEN_TTL_SECONDS`. |
| Demo identity | `server/http/auth/demo.ts` — PBKDF2(SHA-256, 120k) + opaque in-memory tokens. Real validation, explicitly **not** a security boundary; state dies with the tab. |
| Session truth | `GET /api/auth/me` answers only when a token/cookie was actually presented (`tokenPresented`). Demo Mode's implicit tenant is *not* reported as signed in, so `/studio/*` really gates. |
| Onboarding | `POST /api/auth/register` → validates → creates Organization (unique slug) → OWNER user → hashed password → seeds one draft agent → issues session. |
| Rate limits | Separate tighter bucket for `/api/auth/*` (`RATE_LIMIT_MAX/6`, min 5 per window). |
| Required in production | `DATABASE_URL`, `JWT_SECRET` — plus `OPENAI_API_KEY` only when Real Voice is enabled. Demo needs none. |

## Application mode (`APP_MODE`)

`APP_MODE` defaults to **`demo`**, and Demo Mode needs **no credentials at all**:

| Concern | Demo Mode (`APP_MODE=demo`, the default) | Production Mode |
|---|---|---|
| Voice | `DemoVoiceProvider` / `DemoScriptEngine` — scripted turns, no audio | `VOICE_PROVIDER_API_KEY` + `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, else boot exits with the missing names |
| Database | in-memory repository (`DATABASE_URL` not required, `fallbackUsed: true`) | `DATABASE_URL` required |
| JWT | ephemeral process-lifetime secret, no tokens issued, never exposed | `JWT_SECRET` required |
| Storage | not initialised (`STORAGE_BUCKET_NAME` optional) | required when `STORAGE_DRIVER != none` |
| CRM | client never constructed | needs `CRM_API_KEY`; adapter still pending → reported, never faked |
| Telephony | never configured, always reported `false` | later phase |
| OpenAI/Anthropic | never called | only when the key is present |

```
resolveEnv()            → appMode, presence flags only (values are never held on ServerEnv)
validateStartupConfig() → { ok, problems: ["JWT_SECRET", …], notes: [...] }
createApp()             → never throws: degrades to demo + /api/health "degraded"
server adapter          → APP_MODE=production + problems ⇒ prints names, exit(1)
```
Missing/optional variable matrix lives in `.env.example`; `/api/config` returns names and notes
only — no secret value, ever.
The browser mirrors it: `resolveVoiceMode()` probes `/api/health` + `/api/voice/capabilities`;
anything other than a production answer keeps `DemoVoiceProvider`. `HttpVoiceProvider` already
implements the same `VoiceProvider` interface (and degrades to the demo mid-session on any
transport error), so connecting a real engine changes configuration, not components.

## Running it

```bash
node --experimental-strip-types server/adapters/node.ts   # API on :8787
# or expose it to the site:  VITE_API_BASE_URL=http://localhost:8787 npm run dev
```
Without `VITE_API_BASE_URL` the client executes the *same* route handlers in the browser
(`src/api/index.ts` → local transport), so the product is verifiable with no deployment.

## Verifying

Open the site with `?centerai=selftest` (or in dev) and read `window.__CENTERAI_DIAG__`.
It exercises health → capabilities → session → each turn → end → usage → analytics, plus
validation rejection, cross-tenant denial and a "no secrets in responses" assertion.
