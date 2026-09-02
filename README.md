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
npm run typecheck
npm run lint
npm run format
npm run test
npm run build
npm run start
```

## Workspace

```text
apps/web                 React frontend
apps/api                 Fastify backend
packages/contracts       Shared API/config contracts
packages/funnel-engine   Framework-independent funnel logic
configs                  Versioned sample funnel configurations
scripts                  Project automation and traffic generation
```

The active `configs/funnel-v1.json` contains seven screens, a conditional branch and A/B variants.
The backend validates it before returning it to the frontend. The internal `/admin` page is a
read-only view of the active configuration; publishing and rollback are implemented separately.

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

## A/B experiment

The first experiment checks whether asking for the planned amount before the financial goal makes
the value of the funnel clearer and helps more people reach the result. Variant A starts with the
goal; variant B starts with the amount and uses different result copy. The primary metric is
`result_completion_rate` — the share of started unique sessions that reach the result screen.
