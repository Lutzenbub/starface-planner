<!-- Architekturvorschlag: API-Server (Express) -> SyncService -> Playwright Login/Scraper -> Parser -> normalisierte JSON-Speicherung; Instanz-Credentials bleiben nur im RAM, Session-Reuse via .auth/storageState, Frontend konsumiert ausschließlich die Backend-API. -->

# Backend

## Zweck
- Serverseitiger STARFACE-Cloud Login (2-Phasen-Flow inklusive Administration-Weiterleitung)
- Serverseitiges Scraping der Modul-Konfiguration
- Normalisierung in ein stabiles JSON-Schema fuer das Frontend

## Sicherheit
- Credentials werden nicht an STARFACE aus dem Browser gesendet.
- Credentials werden nur im Backend-RAM gehalten.
- `storageState` liegt sensibel unter `.auth/` und ist per `.gitignore` ausgeschlossen.
- Strukturierte Logs mit Redaction sensibler Felder.
- CSRF-Header und restriktive CORS-Origin-Liste.

## Wichtige Endpunkte
- `GET /api/csrf`
- `POST /api/instances`
- `GET /api/instances`
- `POST /api/instances/:instanceId/sync`
- `GET /api/instances/:instanceId/modules`
- `GET /api/instances/:instanceId/health`

## Start
```bash
npm install
npm run dev --workspace backend
```

Optional:
- `DEBUG=true` aktiviert Diagnose-Screenshots
- `STARFACE_ALLOWED_ORIGINS=http://localhost:3000`
- `PLAYWRIGHT_HEADLESS=true|false`
- `PORT` (wird in Cloud-Umgebungen wie Render automatisch gesetzt)

## Render Deployment

Im Repo vorhanden:
- `render.yaml`
- `backend/Dockerfile`

Schritte:
1. In Render per Blueprint deployen.
2. `STARFACE_ALLOWED_ORIGINS=https://lutzenbub.github.io` setzen.
3. Healthcheck pruefen: `https://<service>/api/health`.
