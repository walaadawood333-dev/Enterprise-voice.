# CENTERAI — Final Production Readiness Audit

**Audit date:** 2026-09-04 (Asia/Amman)

**Audited branch:** `arena/01a06817-enterprise-voice`

**Production status:** **NOT PRODUCTION READY**

## Executive Summary

CenterAI has a coherent React application shell, working Demo/in-memory journeys, tenant and platform route guards, database-backed workspace APIs, and a substantial automated regression suite. The current audit executed every discovered test entrypoint: **25/25 test files succeeded, reporting 1,282/1,282 checks successful**. The Vite client production build also succeeded.

The application cannot be approved for production. The decisive blockers are:

1. The production server TypeScript scope has **30 diagnostics** even though the narrower default client `tsconfig.json` succeeds.
2. A production-mode Node startup with realtime enabled terminates with `ReferenceError: createRealtimeService is not defined`.
3. The Prisma production repository does not implement the complete `Db` contract.
4. The Prisma schema defines 33 models, while committed migrations create only 11 tables; 22 mapped tables have no creation migration.
5. Prisma validation did not complete because the schema engine could not be downloaded over TLS; no successful database validation or migration deployment was obtained.
6. Several existing UI journeys are broken: workspace Analytics and Agent Performance remain in loading state after successful API responses; Agent Performance links to a route that does not exist; Calls UI contracts do not match the lowercase API contract.
7. The public site has no visible Sign In/Register navigation, despite direct `/login` and `/register` routes existing.
8. The public site displays a static green “Systems Operational” status without a live health feed.

No new product feature was added as part of this audit.

## Current Architecture

- **Client:** React 19, React Router, Vite, Tailwind; emitted as a single-file browser application.
- **Public surface:** `/` renders the marketing application through `PublicEntry`.
- **Identity surfaces:** `/login` and `/register`, protected by `GuestOnly`.
- **Tenant surfaces:** `/workspace/*` and `/studio/*`, protected by `RequireTenantRole`.
- **Platform surface:** `/admin/*`, protected by `RequirePlatformRole`.
- **API:** a shared router in `server/http/router.ts`, exposed through a Fetch adapter and a Node HTTP adapter.
- **Demo runtime:** in-memory database, in-memory identity broker, simulated voice/telephony providers. The authenticated workspace labels this as `DEMO MODE · simulated providers only`.
- **Intended production runtime:** Node adapter, PostgreSQL through Prisma, bcrypt/JWT identity, OpenAI realtime, and optionally SignalWire.
- **Persistence abstraction:** `Db` contract with memory and Prisma implementations.

The client build and Demo/in-memory application are substantially more complete than the production Node/PostgreSQL path.

## Public Application

### Audit result

| Surface | Exists | Reachable | Protected | Load/API result |
|---|---:|---:|---:|---|
| `/` | Yes | Yes | Public, but redirects an authenticated session | Client build succeeds; public APIs returned 200 in activation tests |
| `/login` | Yes | By direct URL | Guest-only | Login API flow succeeded through the Fetch adapter |
| `/register` | Yes | By direct URL and from Login | Guest-only | Registration, organization creation, owner assignment, starter-agent seed, and session issuance succeeded |

### Findings

- `src/App.tsx` defines `/`, `/login`, and `/register`.
- `src/auth/RouteGuards.tsx` redirects an authenticated user away from `/` to `/workspace/overview` or `/admin/overview`.
- `src/components/Navbar.tsx` contains no link to `/login` or `/register`. The public-site buttons only navigate sections or open the Book a Demo dialog. Therefore the required public website → Sign In journey is not available through the rendered public navigation.
- Login and Register link to each other and back to `/` once reached directly.
- The Book a Demo flow is honest when no endpoint is configured: `src/lib/demoRequest.ts` returns `local-only` and does not claim delivery.
- The public site displays `Systems Operational` at `src/components/Navbar.tsx:90`, `src/components/Navbar.tsx:143`, and `src/sections/FinalCTA.tsx:103`. `src/content/site.ts:408-409` admits that no live status feed exists. This is a static health claim, not a database/service/API/UI path.

## Authentication

### Verified behavior

- Register → persisted organization/user/password digest → issued session succeeded.
- Logout revoked the tested token; the same token then received 401.
- Login after logout succeeded.
- `/api/auth/me` reloads the user and organization from the repository.
- The authenticated organization and role are taken from the persisted user row rather than trusted from request headers/body.
- Tenant and platform users are redirected to role-specific application homes.
- Demo Mode no longer grants an implicit anonymous tenant identity; anonymous tenant requests received 401.
- Production cookies are designed as `HttpOnly`, `SameSite=Strict`, and `Secure` when production TLS is active.

### Blocking findings

- `server/http/auth/production.ts` does not pass full server TypeScript checking because `jose` has no exported `JWKSet` member at the imported location.
- The production Node application does not successfully start with realtime enabled because `createRealtimeService` is referenced but not imported in `server/adapters/node.ts`.
- Platform admin login works only when a platform-role user is already provisioned. The activation test created that row directly in the repository; it did not prove an operational production provisioning path.
- `server/services/provisioning.ts` has 25 TypeScript diagnostics, including stale imports, nonexistent repository methods, invalid enum casing, and invalid audit actions.
- Logout revocation is held in an in-process map. It is not shared across multiple instances.

## Tenant Workspace

All workspace routes are under `RequireTenantRole`, and authoritative authorization is repeated in server handlers.

| UI route | UI component | API path(s) | Reachability/load audit |
|---|---|---|---|
| `/workspace/overview` | `WorkspaceOverview` | `/api/workspace/bootstrap`, `/api/workspace/overview` | Exists; APIs succeeded; metrics are repository-backed |
| `/workspace/calls` | `CallsList` | `/api/workspace/calls` | Exists and fetches, but filtering/status presentation uses the wrong casing |
| `/workspace/calls/:callId` | `CallDetail` | `/api/workspace/calls/:callId` | Exists and API is tenant-scoped; event field contract is mismatched |
| `/workspace/live` | `LiveActivity` | `/api/workspace/live` | Exists; polls repository-backed active sessions |
| `/workspace/agents` | `WorkspaceAgents` | `/api/agents` | Exists; list/create API journey succeeded |
| `/workspace/agents/performance` | `AgentPerformance` | `/api/workspace/agents/performance` | **Broken:** successful fetch never clears `loading` |
| `/workspace/contacts` | `WorkspaceContacts` | None | Exists and explicitly states **Not configured** |
| `/workspace/campaigns` | `CampaignsList` | `/api/workspace/campaigns`, `/api/agents` | Exists; list/create API journey succeeded in entitled tenant |
| `/workspace/campaigns/:campaignId` | `CampaignDetail` | `/api/workspace/campaigns/:campaignId` | Exists; read/update/delete handlers are tenant-scoped |
| `/workspace/analytics` | `AnalyticsPage` | `/api/workspace/analytics` | **Broken:** successful fetch never clears `loading` |
| `/workspace/team` | `WorkspaceTeam` | `/api/users` | Exists; role directory loads; unsupported mutations are stated explicitly |
| `/workspace/integrations` | `IntegrationsPage` | connector control-center APIs | Exists; APIs are tenant-scoped and credential responses are redacted |
| `/workspace/compliance` | `WorkspaceCompliance` | `/api/workspace/compliance/policies` | Exists; feature entitlement and tenant scope enforced |
| `/workspace/settings` | `WorkspaceSettings` | `/api/organizations` | Exists; owner/admin update path succeeded |
| `/workspace/plan` | `WorkspacePlan` | `/api/usage/foundation` | Exists; usage, limits, entitlements, and billing state come from backend services |

### UI defects found

- `src/workspace/pages/AgentPerformance.tsx:19-25`: `setLoading(false)` is only called in `.catch()`. A successful response leaves the page permanently at “Loading agent performance...”.
- `src/workspace/pages/AnalyticsPage.tsx:34-40`: the same success-path loading defect leaves Analytics permanently loading.
- `src/workspace/pages/AgentPerformance.tsx:67` and `:125` link to `/workspace/agents/:agentId`, but `src/workspace/WorkspaceApp.tsx` defines only `agents` and `agents/performance`. The wildcard redirects those links to Overview.
- `src/workspace/pages/CallsList.tsx:14-15` and `:42-65` expect uppercase directions/statuses, while `shared/contracts.ts:234-246` and the API return lowercase values. Non-`all` filters and status styling therefore do not reflect actual calls.
- `CallDetail` expects `event.occurredAt` and `event.payload`, but `/api/workspace/calls/:id` returns persisted `CallEventRow` fields `createdAt` and `metadata` directly (`server/http/router.ts:1420-1435`). Event time and payload presentation are incorrect.
- Campaign creation catches errors only in the console and provides no rendered authorization/entitlement failure message.

## Platform Admin

All `/admin/*` routes are under `RequirePlatformRole`. Server routes independently call `requirePlatformAdmin` or `requirePlatformManager`. A tenant token received 403 from `/api/admin/overview`, and a platform token received 403 from `/api/workspace/overview`.

| UI route | API | Audit result |
|---|---|---|
| `/admin/overview` | `/api/admin/overview` | Exists; persisted aggregate API succeeded |
| `/admin/organizations` | `/api/admin/organizations` | Exists; list API succeeded |
| `/admin/organizations/:id` | Still `/api/admin/organizations` | Route exists, but renders the same list and does not load organization detail |
| `/admin/users` | `/api/admin/v2/users` | Exists; read-only user inventory succeeded |
| `/admin/plans` | `/api/admin/plans` | Exists; API protected by platform role |
| `/admin/subscriptions` | `/api/admin/subscriptions` | Exists; API protected by platform role |
| `/admin/entitlements` | `/api/admin/entitlements` | Exists; organization query is required |
| `/admin/providers` | `/api/admin/providers` | Exists; registry-backed data |
| `/admin/connectors` | `/api/admin/providers` connector section | Exists; registry-backed data |
| `/admin/usage` | `/api/admin/usage` | Exists; repository-backed platform aggregation |
| `/admin/health` | `/api/admin/v2/health` | Exists; derives database/provider/connector state at request time |
| `/admin/audit` | `/api/admin/v2/audit` | Exists; persisted audit events |
| `/admin/settings` | None | Exists and explicitly states **Not configured** |

The activation suite proved these APIs using an in-memory DB and a directly seeded platform user. It did not prove the production Prisma or platform provisioning path.

## Telephony

### Implemented

- Demo provider and simulated inbound/outbound APIs.
- Tenant-scoped call, event, assignment, end, and analytics services.
- SignalWire adapter, bounded payload normalization, exact-raw-body HMAC verification, replay idempotency, and signed webhook/LaML/voice callbacks.
- Provider and connector control-center views for platform admins.
- Production rejects Demo provider traffic.

### Audit findings

- There is no separate tenant Telephony page. The tenant UI exposes call history/detail under `/workspace/calls`; no live call-initiation operation is exposed there.
- Calls UI casing and event-field mismatches make parts of the rendered call history/detail incorrect even though the APIs and persistence path work in Demo tests.
- The Node production entrypoint fails before realtime production operation can start.
- The `calls`, `call_events`, and `organization_telephony_providers` tables are present in the Prisma schema but absent from committed creation migrations.
- Media processing is explicitly unavailable rather than represented as live.

## AI Agents

- UI list/create: `WorkspaceAgents` → `/api/agents` → agent service → `db.agents`.
- Detail/update/delete APIs exist and enforce organization scope.
- Voice session creation verifies agent ownership and entitlements.
- Agent creation and voice-session journeys succeeded in the activation suite.
- Agent performance data is computed from persisted agent/session rows, but the current workspace performance page cannot leave its loading state.
- Agent-performance links target a missing workspace detail route.
- New registration creates a real persisted draft starter agent; it is not presented as production activity.

## Campaigns

- `CampaignsList`/`CampaignDetail` → `/api/workspace/campaigns` → entitlement/limit checks → tenant-scoped campaign repository.
- Create/read/update/delete and cross-tenant denial were exercised through the Fetch adapter.
- Counts shown by the campaign page originate from campaign rows.
- Contacts are not wired to the current workspace UI; the Contacts page honestly reports that no tenant contact API/workflow is configured there.
- The production `campaigns` table and Phase 12 campaign/contact execution tables do not have committed creation migrations.
- Campaign mutation errors are not surfaced to the user in the list modal.

## Analytics

### Data path

- Workspace overview: DB agents/sessions/calls/usage → route aggregation → `/api/workspace/overview` → `WorkspaceOverview`.
- Workspace analytics: DB sessions/calls/usage/agents → `/api/workspace/analytics` → `AnalyticsPage`.
- Platform usage: persisted organizations and usage rows → usage foundation service → `/api/admin/usage` → Admin Usage.
- Platform overview/health: persisted resources and registries → admin APIs → admin pages.

### Findings

- Activation tests compared workspace session/call totals against repository row counts successfully.
- `AnalyticsPage` never clears loading after a successful request, so the route does not render its data.
- `AnalyticsPage` labels `data.agents.length` as “Active Agents” (`src/workspace/pages/AnalyticsPage.tsx:103-108`), but the API maps every organization agent (`server/http/router.ts:1478-1517`), including agents with zero sessions. The metric label is inaccurate.
- Calls-by-direction color logic compares to uppercase `INBOUND`, while API keys are lowercase.
- Admin health is request-derived, but its database check is only whether `db.organizations.list()` throws; it is not a comprehensive dependency/read-write readiness probe.

## Compliance

- Compliance policy APIs are authenticated, entitlement-gated, role-gated for mutations, and organization-scoped.
- DNC and QA services have tenant-scoped repository contracts and regression coverage.
- Workspace Compliance currently exposes the policy list and honest unavailable/empty states.
- The production migrations do not create compliance, DNC, QA template/evaluation/score/finding tables.
- Runtime QA uses `AI_EVALUATION_COMPLETED` and `AI_EVALUATION_FAILED`, but those values are absent from the Prisma `AuditAction` enum and migrations. Production audit writes for these actions would fail even after tables are created.

## SaaS

- Plans, subscriptions, entitlements, effective limits, tenant usage, and platform usage are implemented through services and repositories.
- Feature checks and numeric limits fail closed in the tested memory path.
- Billing is explicitly `NOT_CONFIGURED`; no fake invoice or payment operation is presented as live.
- Branding uploads and custom-domain verification are explicitly not configured.
- Plans/subscriptions/entitlements/branding/audit tables have migrations.
- The production Prisma repository still fails the complete `Db` contract, including invoices/payments and many operational repositories. Billing being intentionally unavailable does not remove the compile-time contract failure.

## Security

### Successfully executed evidence

- Focused Prompt 17 suite: **14/14** current checks successful.
- Authentication register/login/logout/revocation exercised through the Fetch adapter.
- Anonymous tenant access rejected in production and Demo modes.
- Tenant RBAC remains active in Demo Mode.
- Cross-tenant agent, campaign, session, connector, mapping-parent, and repository probes were denied/hidden.
- Tenant users were denied platform APIs; platform identities were denied tenant APIs.
- Cookie-authenticated unsafe requests require an allowed Origin; untrusted CORS origins are not granted access.
- Request body content type, malformed JSON, and byte limits were exercised.
- Rate limiting was exercised.
- Secret redaction, audit metadata scrubbing, XSS sanitization, unsafe branding URLs, CSV formula injection, Salesforce SOQL/host validation, and SignalWire exact-byte signatures/replay idempotency were exercised.
- Client source does not persist session tokens to `localStorage` or `sessionStorage`.

### Limitations and residual risk

- Security tests run primarily against the memory repository. The incomplete Prisma repository/migrations prevent equivalent production-path assurance.
- Rate limits and JWT revocation are process-local and are not safe as global controls in a multi-instance deployment.
- No browser security/E2E runner is installed, and no Chromium/Chrome binary was available. Client guards and rendered behavior were not validated in a real browser.
- No configured production secret values were present in the audit environment, so the artifact value scan had zero secret values to compare. It found no leaked values, but this is not a meaningful production-secret certification.
- The production authentication module itself has a TypeScript error and the production entrypoint has a runtime error; production session security cannot be approved until those paths execute successfully.
- Database-level tenant consistency relies heavily on repositories. Several child tables carry `organizationId` but have only parent-id foreign keys, not composite `(organizationId, parentId)` foreign keys, so the database does not independently enforce all same-tenant parent/child relationships.

## Tests

### Entire discovered suite

Command scope: every `*.ts` file under every `server/**/__tests__/` directory.

- **Test files:** **25/25 succeeded**
- **Reported checks/assertions:** **1,282/1,282 succeeded**
- **Failed test files:** 0
- **Failed reported checks:** 0

These numbers are the aggregate from this audit execution, not a copied Phase total. The 25 files include legacy phase regressions, telephony regressions, SaaS, white-label, control-center, usage/billing, focused security, and activation suites.

### Coverage gap

Passing tests do not establish production readiness because:

- tests do not compile the full production server scope;
- tests use the memory repository for the main application journeys;
- no migration was deployed to PostgreSQL;
- no browser runner renders the routes;
- the successful activation suite checks API journeys and source wiring, so it does not catch the Analytics/Performance loading defects or Calls rendering contract mismatches;
- no test starts the production Node adapter with realtime enabled—the direct audit command did, and it failed.

## Build

| Check | Command | Actual result |
|---|---|---|
| Default TypeScript scope | `tsc --noEmit --pretty false` | Exit 0. This config includes `src` and Vite, not the complete standalone server/Prisma surface. |
| Full production server TypeScript audit | temporary config including `server/**/*.ts` and `shared/**/*.ts`, excluding tests | **Exit 2; 30 diagnostics** |
| Client production build | `npm run build` | Exit 0; 2,006 modules transformed; `dist/index.html` 1,315.23 kB, gzip 365.15 kB |
| Lint | `npm run lint --if-present` | Exit 0 with no output because no `lint` script/tool is configured; no lint analysis was performed |
| Prisma validation | `npx prisma validate` | **Exit 1**; schema engine checksum request failed before validation due TLS/network failure |
| Production Node startup probe | production mode, no listener, placeholder audit credentials, realtime enabled | **Exit 1**; `ReferenceError: createRealtimeService is not defined` |
| Bundle value scan | built artifact vs configured sensitive environment values | 1 artifact scanned; 0 configured secret values were available to check; no value leak detected |

### Full server TypeScript diagnostics by file

- `server/services/provisioning.ts`: 25
- `server/adapters/node.ts`: 3
- `server/db/prisma/repository.ts`: 1
- `server/http/auth/production.ts`: 1

The Prisma diagnostic states that the production repository is missing `orgProviders`, `invoices`, `payments`, `compliancePolicies`, and 17 additional `Db` members.

## Database

### Static inventory

- Prisma schema models: **33**
- Prisma schema enums: **44**
- Tables created by all committed migrations: **11**
- Enums created by all committed migrations: **14**
- Schema-mapped tables with no creation migration: **22**

Missing creation migrations:

1. `calls`
2. `call_events`
3. `organization_telephony_providers`
4. `campaigns`
5. `compliance_policies`
6. `compliance_evaluations`
7. `dnc_records`
8. `qa_evaluation_templates`
9. `qa_evaluation_criteria`
10. `qa_evaluations`
11. `qa_evaluation_scores`
12. `qa_findings`
13. `data_connectors`
14. `data_connector_field_mappings`
15. `data_connector_sync_jobs`
16. `data_connector_activities`
17. `contacts_phase12`
18. `campaign_contacts_phase12`
19. `dial_attempts_phase12`
20. `campaign_events_phase12`
21. `retry_policies_phase12`
22. `campaign_schedules_phase12`

### Constraints and drift

- Existing schema definitions generally include tenant indexes such as `(organizationId, status)` or `(organizationId, createdAt)` and tenant-aware uniqueness for agents, entitlements, DNC records, mappings, and campaign contacts.
- The migration set cannot supply those indexes or foreign keys for the 22 missing tables.
- Prisma `User.role` is currently `String` and `organizationId` is optional, while the initial migration creates `role` as `UserRole` and `organization_id` as `NOT NULL`. The later role migration extends the DB enum even though the current Prisma model does not use it. This is schema/migration drift.
- The two runtime AI evaluation audit actions are absent from the Prisma enum and SQL enum migration.
- Several tenant-owned child models do not have a direct Organization relation or composite tenant-parent foreign key. Application-level scoping is tested, but database-level same-tenant referential integrity is incomplete.
- No generated Prisma client is present in the configured `generated/prisma` output.
- No real PostgreSQL migration deployment, rollback, seed, or repository integration run succeeded during this audit.

## Known Limitations

- Contacts workspace is intentionally **Not configured**.
- Platform Settings is intentionally **Not configured**.
- Branding file uploads, custom-domain verification, payment processing, and general platform-settings writes are intentionally unavailable.
- Book a Demo remains local-only unless `VITE_DEMO_ENDPOINT` is configured, and the UI reports this state.
- Demo identity, data, and tokens are held in browser/process memory and disappear on reload/restart.
- Demo voice and telephony are simulations and are visibly labelled in the authenticated workspace.
- No browser automation, accessibility runner, visual regression runner, or lint configuration is installed.
- Client bundle size is large because the single-file build includes the local Demo application/server graph.
- Admin Users is read-only; admin organization detail route does not provide detail behavior.
- Production requires externally managed PostgreSQL, JWT/OpenAI secrets, TLS, shared rate-limit/revocation storage, and provider configuration; these were not available as a production environment in this audit.

## Production Blockers

1. Resolve all 30 production server TypeScript diagnostics and make full-server checking a required script/CI gate.
2. Repair the production Node entrypoint so realtime startup does not throw.
3. Implement the complete Prisma `Db` repository contract or remove unreachable contract members from the production composition only after proving every API dependency.
4. Create and validate migrations for all 22 missing tables, align `User` role/nullability drift, and add the missing AI evaluation audit enum values.
5. Deploy migrations to a clean PostgreSQL database and execute production repository integration tests.
6. Restore a visible public Sign In path.
7. Repair the Analytics and Agent Performance success-path loading state.
8. Repair Calls list/detail contracts and the missing workspace agent-detail route/link behavior.
9. Remove or replace static `Systems Operational` claims with an honest non-live label or a real health feed.
10. Add browser-level route/journey coverage so rendered loading, links, redirects, and role-specific pages are actually exercised.

## Recommended Next Phase

The next phase should be a **production-path remediation and verification phase**, not feature development:

1. Make `tsc` cover client, Node adapter, production auth, Prisma repository, shared contracts, and active services.
2. Reconcile schema, migrations, generated client, and repository against a clean PostgreSQL instance.
3. Repair only the broken existing journeys and UI/API contract mismatches identified in this report.
4. Add browser tests for public → login/register, tenant roles, platform roles, broken links, successful data rendering, logout, and cross-tenant attacks.
5. Add multi-instance shared rate limiting/revocation or explicitly constrain deployment to one instance until those controls exist.
6. Run a clean-room production startup, migration deploy, smoke test, security suite, full test suite, full TypeScript, lint, and production build.
7. Repeat this audit and change the production status only after every blocker has an executed successful result.
