# Funnel Runtime

Fullstack workspace for a configurable funnel runtime.

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
```

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
