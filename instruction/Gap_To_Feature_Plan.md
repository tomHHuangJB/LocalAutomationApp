# Gap-to-Feature Plan (Automation Readiness)

## Goal
Close remaining gaps so the app can demonstrate advanced Selenium, Playwright, Cypress, and Appium (mobile web) automation skills.

## Top Gaps → Features
1. Deterministic race/flaky labs
   - Add `/api/race` with controllable delays and labels for out-of-order responses.
   - Add `/api/dedup` to demonstrate request coalescing.
2. Stale element / rerender lab
   - Add UI section with nodes that re-render and replace DOM while preserving labels.
3. Mobile gesture surface (Appium-ready)
   - Add `/mobile` page with swipe, long-press, pull-to-refresh, and orientation state.
4. Service worker mock
   - Add a real `sw.js` and wire register/unregister buttons.
5. File uploads/downloads with resumable and checksum behaviors
   - Add `/api/upload/chunk` and `/api/upload/complete` with in-memory tracking.
   - Extend `/api/download/:id` to return checksum header and mismatch toggle.
6. CSP enforcement test
   - Add `/csp-test` HTML endpoint with CSP header to validate blocked resources.
7. API-driven UI actions
   - Wire buttons in Dynamic and Files to real API calls and log outcomes.

## Files to Change
- `backend/src/index.ts`
- `frontend/src/App.tsx`
- `frontend/src/pages/Dynamic.tsx`
- `frontend/src/pages/Components.tsx`
- `frontend/src/pages/Files.tsx`
- `frontend/src/pages/Integrations.tsx`
- `frontend/src/pages/Mobile.tsx` (new)
- `frontend/public/sw.js` (new)

## Acceptance Criteria
- Race condition demo produces out-of-order results without flakiness.
- Dedup demo returns cached response when key repeats.
- Stale element lab visibly re-renders DOM nodes with stable labels.
- Mobile page supports swipe, long-press, pull-to-refresh, and orientation display.
- Upload progress is driven by chunked API calls; downloads expose checksum header.
- CSP test page blocks inline script with enforcement.
- Service worker register/unregister buttons work.

## Optional Follow-ups
- Add profile-specific docker-compose overrides for flaky/slow/overload envs.
- Expand `data-qa`, `data-playwright`, `data-selenium` coverage on all key actions.
