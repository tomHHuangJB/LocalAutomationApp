# Repository Guidelines

## Project Structure & Module Organization
This repository currently contains a single requirements document at `doc/prompt.md`. It is the source of truth for the application scope and must stay in sync with implementation decisions.

When the implementation lands, keep code organized by service:
- `frontend/` for the React + Vite + Tailwind SPA.
- `backend/` for the Node.js + Express TypeScript API and WebSocket server.
- Root-level `docker-compose.yml` and Dockerfiles for multi-stage builds and profiles.
- `doc/` for requirements and architecture notes.

## Build, Test, and Development Commands
No build or test scripts are committed yet. When you add them, document them here and in the README. The expected primary workflows are:
- `docker compose up --build` to bring up the full stack with profiles.
- `npm run dev` in `frontend/` and `backend/` for local development.
- `npm run lint` and `npm run format` once linting/formatting are configured.

## Coding Style & Naming Conventions
Follow existing file conventions; do not introduce new style rules without tool support. For TypeScript/JavaScript, keep modules small and single-purpose, and align with whichever formatter is adopted (e.g., Prettier). For data-test hooks, use consistent, explicit selectors from the prompt:
- `data-testid` for functional tests.
- `data-qa` for manual testing hooks.
- `data-playwright` and `data-selenium` for tool-specific selectors.

## Testing Guidelines
This project is the application under test; do not add test code unless explicitly requested. If tests are later introduced, keep them in dedicated test directories (e.g., `frontend/tests/`, `backend/tests/`) and name them `*.spec.ts` or `*.test.ts`. Document any coverage expectations alongside the test runner.

## Commit & Pull Request Guidelines
No git history or conventions are present yet. If this repository is placed under version control, prefer Conventional Commits (e.g., `feat:`, `fix:`, `docs:`) and include:
- Clear problem/solution summary.
- Steps to run locally and verify behavior.
- Screenshots/GIFs for UI changes.

## Agent-Specific Notes
`doc/prompt.md` is authoritative; do not diverge from its requirements without a deliberate update to that file. Avoid adding automated tests unless the user requests them.
