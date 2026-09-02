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
- API: http://localhost:3001

Additional commands:

```bash
npm run typecheck
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
