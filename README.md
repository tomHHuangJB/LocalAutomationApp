# Local Automation Lab

A local, dockerized practice platform for senior/principal test automation engineers. It’s built to demo advanced Selenium, Playwright, Cypress, and mobile web (Appium) automation skills through realistic UI, API, performance, and security scenarios.

## Quick Start

```bash
docker compose --profile stable up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API docs (Swagger UI): http://localhost:3002

## Local Backend Only

If you want to run only the backend locally for API and gRPC practice:

```bash
cd backend
npm install
npm run build
npm start
```

Default ports:

- HTTP API: `http://localhost:3001`
- gRPC: `localhost:50051`

If port `3001` or `50051` is already in use, either stop the existing process or run on alternate ports:

```bash
PORT=3101 GRPC_PORT=51051 npm start
```

Useful cleanup commands:

```bash
lsof -ti :3001 | xargs kill
lsof -ti :50051 | xargs kill
```

If you want to inspect the port owner before killing it:

```bash
lsof -i :3001
lsof -i :50051
```

## Profiles

Use profiles to simulate test conditions without changing test code:

```bash
docker compose --profile stable up --build
docker compose --profile flaky up --build
docker compose --profile slow up --build
docker compose --profile overload up --build
```

Profile behavior (backend):
- `stable`: default behavior, no artificial delay/failures.
- `flaky`: intermittent failures and mild delays (deterministic pattern).
- `slow`: consistent high latency for timeout and wait tuning.
- `overload`: elevated latency and reduced real-time features (WebSockets disabled).

## Features

### UI Scenarios
- **Dashboard**: mega-menu navigation, responsive layouts, WebSocket notifications, accessibility landmarks.
- **Auth Suite**: login, MFA, OAuth simulation, token refresh, concurrent sessions, SSO logout propagation, lockout/reset edge cases.
- **Advanced Forms**: conditional fields, multi-step wizards, dynamic arrays, iframe editor, drag-drop uploads, masked inputs, dual sliders, time zones, Shadow DOM.
- **Components**: virtualized lists, infinite scroll, SVG charts, canvas, context menus, tooltips, toasts.
- **Tables/Grids**: inline edit, virtualization, column resize/reorder/pin, bulk actions, server-side sort/filter, cursor/offset pagination.
- **Dynamic State**: optimistic updates, race conditions, request dedupe, eventual consistency, partial content, offline cache conflicts, WebSocket reconnects.
- **Errors & Edge**: network failures, timeouts, partial loads, memory leaks, security labs.
- **Performance**: large DOM, heavy animations, lazy loading, Web Workers, resource timing, main-thread blocking, CPU throttling indicator.
- **Accessibility**: screen reader announcements, focus traps, keyboard traps, high-contrast and reduced-motion toggles.
- **i18n/RTL**: locale switching, RTL layouts, pluralization, timezone widgets, missing translations.
- **Files/Downloads**: validation, resumable uploads, download retries, checksum verification.
- **Mobile Web**: gestures, long-press, pull-to-refresh, orientation changes.
- **Experiments**: deterministic A/B variants, query/cookie overrides, role-gated flags.
- **Integrations**: sandboxed iframes, postMessage, CSP-restricted content.
- **System**: permissions, native dialogs, multi-window flows, cross-tab isolation, role-based UI.

### API & Reliability
- Deterministic delays/failures via query params and env config.
- WebSocket real-time events with heartbeat and reconnect behaviors.
- In-memory SQLite for safe SQL injection practice.
- Configurable slow/flaky/overload profiles.

### Security & OWASP Practice
- Injection labs (SQL/NoSQL/OS), broken access control, XSS toggles.
- SSRF simulator, crypto failures, misconfig toggles, vulnerable component simulation.
- CSP enforcement/report-only, clickjacking defenses, mixed content, open redirect validation.
- Security headers validation, audit log visibility.
