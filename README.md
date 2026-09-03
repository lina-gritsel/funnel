# Funnel Runtime

Fullstack workspace for a configurable funnel runtime.

- Repository: [github.com/lina-gritsel/funnel](https://github.com/lina-gritsel/funnel)
- Public demo: [funnel-production-7673.up.railway.app](https://funnel-production-7673.up.railway.app)
- Protected admin: [configuration](https://funnel-production-7673.up.railway.app/admin) / [analytics](https://funnel-production-7673.up.railway.app/admin/analytics)

## Acceptance matrix

| Assignment area                                  | Implementation evidence                                                        | Status   |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | -------- |
| Dynamic 6+ step funnel, branching and validation | JSON contracts, independent funnel engine and config-driven React renderer     | Complete |
| Back, refresh and repeated opening               | Server-persisted trail/answers plus session and draft restoration              | Complete |
| Version publication, pinning and rollback        | Transactional version service and immutable session version                    | Complete |
| Stable backend A/B assignment and override       | Weighted server assignment with `?variant=A\|B` test override                  | Complete |
| Seven events, batching and idempotency           | Server-owned transition events plus validated client interaction outbox        | Complete |
| Unique-session analytics                         | Step conversion/dropoff, result rate, CTA CTR, A/B, version and UTM views      | Complete |
| 100-session traffic generator                    | Deterministic public-API generator with duplicate and out-of-order delivery    | Complete |
| Second iteration                                 | v2 branch, B-only step removal, custom event, publish and rollback             | Complete |
| Automated verification                           | Unit/integration suite, production smoke path and Playwright lifecycle E2E     | Complete |
| Reproducible production path                     | Compiled server, same-origin SPA, Dockerfile, healthcheck and Render Blueprint | Complete |
| Working public URL                               | Railway HTTPS demo with persistent SQLite storage                              | Complete |

## Requirements

- Node.js 20+
- npm 10+

## Commands

```bash
npm install
npm run dev
```

The development servers start at:

- Web: http://localhost:5173
- Funnel variant A: http://localhost:5173/?variant=A
- Funnel variant B: http://localhost:5173/?variant=B
- Config admin: http://localhost:5173/admin
- Analytics admin: http://localhost:5173/admin/analytics
- UI foundation: http://localhost:5173/dev/ui
- API: http://localhost:3001
- Active funnel config: http://localhost:3001/api/funnels/active

Additional commands:

```bash
npm run generate:traffic
npm run typecheck
npm run lint
npm run format
npm run test
npm run build
npm run start
npm run test:e2e
```

The end-to-end suite builds and starts the production application with an isolated in-memory SQLite
database. It covers both experiment variants, session restore after refresh, Back navigation,
publishing v2 without moving existing sessions, rollback and protected admin access.

The GitHub Actions workflow runs lint, type checking, unit/integration tests, the production build and
the Chromium E2E suite for every push and pull request.

`npm run start` is the production command. Run `npm run build` first; the Fastify process then serves
both the API and the compiled React SPA from the same origin. `PORT` controls the public port,
`API_HOST` the listening interface and `SQLITE_PATH` the persistent database location.

## Production with Docker

Build and run the complete application as one container:

```bash
docker build -t funnel-runtime .
docker run --name funnel-runtime \
  -p 3001:3001 \
  -e ADMIN_TOKEN=replace-with-a-long-random-secret \
  -v funnel-runtime-data:/data \
  funnel-runtime
```

Open `http://localhost:3001` for the funnel and `http://localhost:3001/admin` for the protected
administration area. The named volume keeps SQLite data between container replacements. The image
contains a healthcheck for `/api/health`.

### Hosted demo on Railway

The public demo runs as one Docker service with a persistent volume mounted at `/data`.
The service is connected to the `master` branch of this public repository for automatic deployments.
To reproduce the setup, connect the repository, keep the repository root as the build directory,
attach a volume at `/data`, and configure these service variables:

| Variable          | Value                                          |
| ----------------- | ---------------------------------------------- |
| `NODE_ENV`        | `production`                                   |
| `API_HOST`        | `0.0.0.0`                                      |
| `PORT`            | `3001`                                         |
| `SQLITE_PATH`     | `/data/funnel.db`                              |
| `ADMIN_TOKEN`     | A unique random secret, stored only in Railway |
| `RAILWAY_RUN_UID` | `0` for access to Railway's root-owned volume  |

Set the Railway healthcheck path to `/api/health`, timeout to 120 seconds, and restart retries to 3.
Generate a Railway domain with target port `3001`. Keep a single replica for SQLite.
The container build checks that SQLite and the external server dependencies can be loaded.

The owner approved running this demo container as root to access the volume. This is a hosting-specific
security tradeoff; the Dockerfile otherwise defaults to the unprivileged `node` user. The demo uses a
trial account, so continued availability depends on Railway credits and plan limits. No paid upgrade
was activated as part of deployment. Retrieve `ADMIN_TOKEN` from the service's Variables tab and share
it with the reviewer privately; never commit it or put it in a URL.

### Alternative: Render

`render.yaml` defines the same Docker service and can be launched with the
[Render Blueprint](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Flina-gritsel%2Ffunnel).
The repository is public. The free Blueprint uses ephemeral SQLite storage; attach a persistent disk
at `/data` and change `SQLITE_PATH`
to `/data/funnel.db` when demo data must survive service replacement. Share the generated admin token
with the reviewer separately.

The equivalent non-container startup is:

```bash
npm run build
NODE_ENV=production \
PORT=3001 \
SQLITE_PATH=./data/funnel.db \
ADMIN_TOKEN=replace-with-a-long-random-secret \
npm start
```

In production, admin APIs are disabled when `ADMIN_TOKEN` is missing. When it is configured, the
configuration history, config validation, draft creation, publication, rollback and analytics require
the matching `X-Admin-Token` header. The admin UI requests the token before loading protected data and
keeps it only in `sessionStorage`. Public funnel and session endpoints do not require this token.

For local development without `ADMIN_TOKEN`, admin access remains open for convenience.

## Workspace

```text
apps/web                 React frontend
apps/api                 Fastify backend
apps/api/src/generate-traffic.ts  Synthetic traffic command
packages/contracts       Shared API/config contracts
packages/funnel-engine   Framework-independent funnel logic
configs                  Versioned sample funnel configurations
```

## Architecture

```text
React SPA
├── funnel runtime ── public session API
├── admin UI ──────── token-protected config and analytics API
└── event outbox ──── batched interaction events
                         │
Fastify API ─────────────┤
├── config service       ├── shared Zod contracts
├── session service      ├── framework-independent funnel engine
├── event service        └── SQLite
└── analytics service
```

The server is authoritative for the active config, assigned version and variant, route, submitted
answers and transition events. The browser renders the resolved config and sends only user intent.
Shared contracts keep API payloads, configs and the runtime engine aligned.

## Data model

| Table                   | Key data and responsibility                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `funnel_versions`       | Composite key `(funnel_id, version)`, immutable config JSON, lifecycle status and publication timestamps. A partial unique index permits one active version. |
| `sessions`              | Session ID, pinned funnel version and variant, current step, complete trail, cursor, answers, UTM values and completion timestamp.                           |
| `events`                | Unique `event_id`, session, event name, client/server time, server-enriched version/variant/UTM, step and non-sensitive properties.                          |
| `session_reached_steps` | Unique `(session_id, step_id)` evidence used to reject events for steps the session never reached.                                                           |

`sessions` logically reference a retained funnel version. Events and reached steps reference their
session. Archived configs are never deleted, allowing old sessions and historical analytics to keep
working after publication or rollback.

## Event contract and trust boundary

| Field                            | Source                                        | Rule                                                                                                                                      |
| -------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`                       | Client for UI events; server for state events | Globally unique; a repeated ID is reported as a duplicate and not inserted again.                                                         |
| `session_id`                     | Client request                                | Must identify an existing session.                                                                                                        |
| `event_name`                     | Client or server                              | Client may send reached-step views and result interactions; answer, completion, back and custom events are produced by session mutations. |
| `client_timestamp`               | Client request                                | Retained for delivery analysis; not used as the authoritative ordering clock.                                                             |
| `server_timestamp`               | API                                           | Assigned on receipt or in the session transaction.                                                                                        |
| `funnel_version`, `variant`, UTM | API from session                              | Client values are not trusted or accepted.                                                                                                |
| `step_id`                        | Client or server                              | Must exist in the pinned resolved variant and have been reached; result events require a result step.                                     |
| `properties`                     | Client or server                              | Raw answers and answer-like keys are rejected from analytics events.                                                                      |

State mutation, reached-step recording and server-owned events share a SQLite transaction. A malformed
event is rejected independently, so it cannot poison the rest of a batch.

The bundled `configs/funnel-v1.json` contains seven screens, a conditional branch and A/B variants.
On the first start, the backend validates it and seeds SQLite with active version 1. The second local
config, `configs/funnel-v2.json`, is supplied as a draft for the second-iteration workflow.

## Configuration versions

SQLite is the runtime source of truth for funnel configurations. The internal `/admin` page shows
the active configuration and version history, accepts the next JSON version as a draft, publishes a
draft without redeploying and rolls back to the previous published version. Publication and rollback
are transactional, so only one version is active at a time.

Sessions store their assigned version number and always load that exact configuration. Publishing or
rolling back changes only newly created sessions; existing sessions continue on their pinned version.
Archived configurations remain available for session recovery and historical analytics.

### Second iteration

Version 2 adds a planning-horizon question and a short-horizon branch with a liquidity explanation.
Variant B removes the education screen and goes directly from experience to the result. The config
also declares `investment_horizon_selected`, emitted after the new horizon step is completed. Custom
events are accepted only when the pinned funnel version declares the exact event name and step.

Use `/admin` to upload `configs/funnel-v2.json`, publish the draft and later roll back to version 1.
Sessions created before publication keep version 1, sessions created while version 2 is active keep
version 2 even after rollback, and new sessions after rollback use version 1 again. Historical version
totals, the version 2-only steps and the custom event remain visible in analytics after rollback.

## Sessions

The API stores funnel sessions in the local `data/funnel.db` SQLite file. A session pins the funnel
version and A/B variant, and saves the current step, route, answers and UTM parameters after every
forward or back action. The browser keeps only the session id in `localStorage`, so a refresh restores
the server-confirmed state. `?variant=A` and `?variant=B` remain available as explicit test overrides.

## Events and analytics

The runtime records the seven required events: `session_started`, `step_viewed`,
`answer_submitted`, `step_completed`, `back_clicked`, `result_viewed` and `cta_clicked`.
Client events are kept in a local outbox, delivered in batches to `POST /api/events/batch` and retried
after failures. `event_id` is unique, so retrying the same batch does not create duplicates. One bad
event is rejected independently and does not prevent valid neighbors from being stored.

The backend adds the server timestamp, pinned funnel version, A/B variant and UTM values from the
session before writing to SQLite. Raw answers are rejected from analytics properties. The dashboard
at `/admin/analytics` counts unique sessions, not event rows, and supports step conversion, dropoff,
result rate, CTA CTR, A/B and version comparison, plus filtering by `utm_campaign`.

Aggregation rules:

- started sessions: distinct `session_id` with `session_started`;
- step reach: distinct `session_id` with `step_viewed` for the step;
- step completion: distinct `session_id` with `step_completed` for the step;
- result rate: distinct result viewers divided by distinct started sessions;
- CTA CTR: distinct CTA clickers divided by distinct result viewers.

## Synthetic traffic

With the API running, populate the dashboard with a deterministic set of 100 sessions:

```bash
npm run generate:traffic
```

Run the generator against the local development server before enabling production-only admin
protection; it verifies its output through the analytics endpoint.

The generator uses the public HTTP API rather than writing to SQLite directly and adapts its routes
to active version 1 or 2. It creates five UTM
campaigns with 20 sessions each, splits traffic evenly between variants A and B, covers both funnel
branches and dropoffs at different steps, and includes repeated views, back navigation, batches,
duplicate delivery and out-of-order events. It appends data without clearing existing sessions.

The expected increment is 100 started sessions, 50 result viewers and 30 CTA clickers. Every
synthetic campaign adds 20 sessions, 10 result viewers and 6 CTA clickers. After delivery, the command
checks overall, per-variant, per-campaign and per-step analytics and exits with an error if the numbers
do not match. On version 2 it also covers both horizon routes, verifies that variant B skips education
and produces `investment_horizon_selected` for 60 unique sessions. Use `FUNNEL_API_URL` to target
another API origin:

```bash
FUNNEL_API_URL=http://localhost:3001 npm run generate:traffic
```

## A/B experiment

The first experiment checks whether asking for the planned amount before the financial goal makes
the value of the funnel clearer and helps more people reach the result. Variant A starts with the
goal; variant B starts with the amount and uses different result copy. The primary metric is
`result_completion_rate` — the share of started unique sessions that reach the result screen.

## Iteration timeline

- Iteration 1: configurable seven-screen funnel, stable A/B assignment, persisted sessions, batched
  events, unique-session analytics and deterministic synthetic traffic.
- Iteration 2: a second JSON config with a new conditional route, a B-only screen removal, a
  config-declared event, publication with pinned legacy sessions and rollback without analytics loss.

## Architecture decisions

1. **Config as validated data.** Zod validates structure and graph invariants for A and B before a
   draft can be published. Preview enumerates reachable routes and result terminals.
2. **Versions are pinned, not migrated.** A session stores its version and always resolves against
   that config. Publication is a pointer switch for future sessions; rollback is the same operation in
   reverse.
3. **The server owns state-derived events.** Answer submission, completion, Back and custom events are
   emitted inside session mutations. Client events are limited to observable UI interactions and are
   checked against the server-confirmed route.
4. **Delivery is at least once.** The browser outbox batches, retries and uses `sendBeacon`; the unique
   event ID makes repeated delivery safe.
5. **SQLite keeps the exercise reproducible.** Transactions and a partial unique index provide useful
   integrity without an external service. The application stays deployable as one container.
6. **Admin protection is deliberately small.** A constant-time shared-token check protects mutations,
   history and analytics without introducing an unrelated user-management subsystem.

## Assumptions and known limitations

- One funnel family is bundled and seeded. The schema supports versions of that funnel, not a
  multi-tenant funnel catalogue.
- SQLite is intended for a single application instance. Horizontal scaling would require a shared
  database and coordinated publication transactions.
- The free Render Blueprint uses ephemeral storage. Production-like persistence requires a mounted
  disk at `/data`, as shown by the Docker setup.
- `ADMIN_TOKEN` is shared reviewer access, not per-user authentication, authorization or audit logging.
- Submitted state lives on the server. An unsubmitted field draft is scoped to the browser tab in
  `sessionStorage`, survives refresh, and is cleared after the step changes.
- Client timestamps are informational; server timestamps and server-confirmed session state are the
  source of truth.
- Analytics deliberately expose aggregate counts without date-range segmentation or data export.
- The JSON upload page is an internal publishing tool, not a visual funnel editor.

## AI-assisted development process

AI agents were used as implementation and review tools, while the repository owner remained
responsible for scope, source review and final verification.

1. The assignment was decomposed into contracts/engine, UI, persistence, events, analytics, traffic
   generation and second-iteration versioning.
2. Each slice was implemented in a separate commit and checked with types and focused tests before the
   next slice.
3. A separate adversarial review reproduced two high-risk failures: publishable graph cycles and
   forged result analytics.
4. The fixes moved graph safety into config validation and state-derived events into server-owned
   session transactions, with regression tests for both attacks.
5. Production serving, admin protection and the complete browser lifecycle were then verified through
   build, API smoke checks and Playwright.

The commit sequence documents this process. In particular, `f4eb0ea` contains the adversarial
hardening, `a24b808` adds the production/security boundary, and `b688606` adds browser E2E and CI.
