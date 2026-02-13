# Starface Planner Monorepo

Starface Planner ist jetzt als Monorepo mit zwei eigenstaendigen Paketen organisiert:
- `frontend/`: React + Vite App
- `backend/`: Express API mit Zod-Validierung

## Struktur

```text
starface-planner/
|- frontend/
|  |- src/
|  |- tests/
|  |- index.html
|  |- package.json
|  |- tsconfig.json
|  |- vite.config.ts
|  `- vitest.config.ts
|- backend/
|  |- src/
|  |- test/
|  |- data/modules.json
|  `- package.json
`- package.json
```

## Setup

```bash
npm install
```

## Entwicklung

Startet Frontend und Backend parallel:

```bash
npm run dev
```

Standard-URLs:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:55123`
- Healthcheck: `http://localhost:55123/api/health`

Optionaler Backend-Port:
- `STARFACE_BACKEND_PORT=4200 npm run dev`

## Build

```bash
npm run build
```

## Tests

Fuehrt Backend-Integrationstests und Frontend+Backend-Integrationstests aus:

```bash
npm test
```

## API

- `GET /api/modules`
- `POST /api/modules`
- `GET /api/health`

Module werden in `backend/data/modules.json` gespeichert.
