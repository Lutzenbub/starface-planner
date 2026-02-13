# Starface Planner Monorepo

Starface Planner besteht aus:
- `frontend/`: React + Vite Kalender-/Zeitstrahl-UI
- `backend/`: TypeScript API (Express + Playwright) fuer STARFACE Cloud Login, Scraping und Normalisierung

## Setup

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

Standard-URLs:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:55123`

## Build und Tests

```bash
npm run build
npm test
```

## Backend Konfiguration

Wichtige Env-Variablen:
- `STARFACE_BACKEND_PORT` (Default `55123`)
- `STARFACE_ALLOWED_ORIGINS` (CSV, z. B. `http://localhost:3000`)
- `DEBUG=true` (aktiviert Diagnose-Screenshots in `backend/DEBUG/`)
- `PLAYWRIGHT_HEADLESS=true|false`

Optional fuer Browser-Binaries:

```bash
npm run playwright:install --workspace backend
```

## API Uebersicht

- `GET /api/health`
- `GET /api/csrf`
- `GET /api/instances`
- `POST /api/instances`
  - Input: `baseUrl`, `username`, `password`, optional `displayName`
  - Akzeptiert Instanzname (`firma123`) und normalisiert zu `https://firma123.starface-cloud.com`
- `POST /api/instances/:instanceId/sync`
- `GET /api/instances/:instanceId/modules`
- `GET /api/instances/:instanceId/health`

## STARFACE Cloud Login Ablauf (Backend)

1. Login auf `https://<instanz>.starface-cloud.com`
2. Klick auf Administration (`td#config`)
3. Redirect auf `/config/display.do`
4. Falls erforderlich: zweiter Login im Admin-Kontext
5. Danach Scraping der Modul-/Regeltexte

Fehlercodes:
- `LOGIN_FAILED`
- `ADMIN_BUTTON_NOT_FOUND`
- `ADMIN_REDIRECT_FAILED`
- `FRONTEND_CHANGED`
- `PARSE_FAILED`

## Normalisiertes Ausgabeformat (Beispiel)

```json
{
  "instanceId": "inst-123",
  "fetchedAt": "2026-02-13T20:00:00.000Z",
  "selectorVersion": "starface-cloud-v2026-02-13",
  "warnings": [],
  "modules": [
    {
      "moduleId": "mod-1",
      "moduleName": "Standard AB",
      "modulePhoneNumber": "004928722411242",
      "rules": [
        {
          "ruleId": "rule-1",
          "label": "Arbeitszeit",
          "daysOfWeek": [1, 2, 3, 4, 5],
          "timeWindows": [{ "start": "08:00", "end": "13:00" }],
          "dateRange": { "start": "2026-02-01", "end": "2026-03-31" },
          "target": { "type": "number", "value": "+4949..." },
          "order": 1,
          "rawText": "montags bis freitags 08:00 bis 13:00 ..."
        }
      ]
    }
  ]
}
```

## Sicherheit

- Credentials werden nie im Browser gespeichert oder von dort direkt an STARFACE gesendet.
- Credentials liegen nur im Backend-RAM.
- Session-Reuse erfolgt optional ueber `backend/.auth/*.json` (`.gitignore` ausgeschlossen).
- Logs sind strukturiert und redacted (Passwort/Cookies/Auth-Header).
