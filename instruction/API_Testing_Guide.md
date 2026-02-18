# API Testing Guide

## Postman
1. Open Postman.
2. Import `instruction/LocalAutomationLab.postman_collection.json`.
3. Import `instruction/LocalAutomationLab.postman_environment.json`.
4. Select the environment “Local Automation Lab”.
5. Run requests against `http://localhost:3001`.

## Bruno (free, open-source)
1. Open Bruno.
2. Open collection from `instruction/bruno/`.
3. Select environment `Local` (baseUrl: `http://localhost:3001`).
4. Run requests by folder or individually.

## Tips
- Use `flaky` and `slow` profiles to practice retries and timeouts.
- Use `overload` to test behavior when WebSockets are disabled.
- Check checksum behavior using `/api/download/{id}?checksum=bad`.
