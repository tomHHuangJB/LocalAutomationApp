# Local Automation Lab

A local, dockerized practice platform for principal-level Selenium (Java) and Playwright (TypeScript) automation interviews. The app is designed to surface real-world flakiness, performance, security, and UI edge cases.

## Quick Start

```bash
docker compose --profile stable up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API docs (Swagger UI): http://localhost:3002

## Features & Practice Areas

### Core UI Scenarios
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

## Skills → Page Map (Short)

| Skill | Page/Area |
| --- | --- |
| Auth + session management | `/auth` |
| Advanced UI interactions | `/forms`, `/components`, `/tables` |
| Async/race conditions | `/dynamic` |
| Error handling + resilience | `/errors` |
| Performance profiling | `/performance` |
| Accessibility (screen reader/keyboard) | `/a11y` |
| i18n/RTL + timezone | `/i18n` |
| Files + downloads | `/files` |
| Feature flags + roles | `/experiments`, `/system` |
| Cross-origin/iframes | `/integrations` |
| Permissions + multi-window | `/system` |
| Security/OWASP labs | `/errors` + `/api/security/*` |

## API Endpoints (Summary)

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/auth/sessions`
- `POST /api/auth/forgot`
- `POST /api/auth/reset`
- `POST /api/auth/lockout`

### Data and Flags
- `GET /api/data`
- `POST /api/data`
- `PUT /api/data/:id`
- `DELETE /api/data/:id`
- `POST /api/batch`
- `GET /api/flags`
- `POST /api/idempotent`
- `GET /api/pagination`
- `GET /api/consistency`
- `GET /api/partial`

### Files
- `POST /api/upload`
- `GET /api/download/:id`

### System and Security
- `GET /api/permissions`
- `POST /api/csp-report`
- `GET /api/roles`
- `GET /api/time-skew`
- `GET /api/security/injection`
- `GET /api/security/access-control`
- `GET /api/security/xss`
- `GET /api/security/misconfig`
- `GET /api/security/vulnerable`
- `GET /api/security/ssrf`
- `GET /api/security/crypto`
- `GET /api/security/logging`
- `GET /api/security/headers`
- `GET /api/security/redirect`
- `POST /api/reset`
- `POST /api/seed`

### WebSocket
- `ws://localhost:3001/ws` (events: `notification`, `dataUpdate`, `sessionExpiring`)

## OpenAPI Spec

OpenAPI 3.0 stub lives at `doc/openapi.yaml`. It includes deterministic controls, security labs, and test harness endpoints.

Load it in Swagger UI or any OpenAPI viewer to explore request/response shapes.

## Documentation Index

- `doc/Project_Charter.md`
- `doc/Project_Plan.md`
- `doc/Feasibility_Study.md`
- `doc/SRS.md`
- `doc/Data_Dictionary.md`
- `doc/HLD.md`
- `doc/FSD.md`
- `doc/LLD.md`
- `doc/UI_Mockups.md`
- `doc/Test_Plan.md`
- `doc/Functional_Test_Plan.md`
- `doc/Regression_Test_Plan.md`
- `doc/Performance_Test_Plan.md`
- `doc/Security_Test_Plan.md`
- `doc/Smoke_Sanity_Test_Plan.md`
- `doc/Functional_Test_Cases.md`
- `doc/API_Functional_Test_Cases.md`
- `doc/Regression_Test_Cases.md`
- `doc/Performance_Test_Cases.md`
- `doc/Security_Test_Cases.md`
- `doc/Smoke_Sanity_Test_Cases.md`
- `doc/Test_Design_Artifacts.md`
- `doc/Defect_Log.md`
- `doc/Test_Summary_Report.md`
- `doc/Deployment_Plan.md`
- `doc/Installation_Guide.md`
- `doc/Release_Notes.md`
- `doc/Maintenance_Plan.md`
- `doc/Patch_Notes.md`
- `doc/User_Manual.md`
- `doc/Test instructions.md`
- `doc/Java Selenium daily.md`
- `doc/Python Selenium daily.md`
- `doc/TypeScript Playwright daily.md`
- `doc/Java Architecture Summary.md`
- `doc/Python Architecture Summary.md`
- `doc/TypeScript Architecture Summary.md`
- `doc/Java Interview Talking Points.md`
- `doc/Python Interview Talking Points.md`
- `doc/TypeScript Interview Talking Points.md`
## Useful URLs
- Frontend routes: `/`, `/auth`, `/forms`, `/components`, `/tables`, `/dynamic`, `/errors`, `/performance`, `/a11y`, `/i18n`, `/files`, `/experiments`, `/integrations`, `/system`.
- Backend health: http://localhost:3001/health

## Mobile Navigation (Test Support)
- Mobile nav is rendered under a menu button visible on small screens.
- Stable locators for automation:
  - `data-testid="mobile-menu-button"`
  - `data-testid="mobile-nav-<label>"` (example: `mobile-nav-forms`)
- Desktop nav remains available via `data-testid="nav-<label>"`.

## Profiles
Use Docker Compose profiles to simulate test conditions:
- `stable` (default)
- `flaky`
- `slow`
- `overload`

Example:
```bash
docker compose --profile flaky up --build
```
