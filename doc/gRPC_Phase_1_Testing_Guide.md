# gRPC Phase 1 Testing Guide

Phase 1 adds a real gRPC `InventoryService` to the backend on port `50051`.

## What was added

- `GetStock`
- `ReserveStock`
- `ReleaseStock`
- `ResetInventory`

Manual testing concepts now available:

- unary RPC testing
- request validation
- business error mapping
- metadata testing with correlation IDs
- deterministic fault injection with gRPC status codes
- stateful reserve/release workflow testing

## Start the backend

From `backend/`:

```bash
npm run build
npm start
```

Expected startup lines:

```text
API server running on 3001
gRPC inventory server running on 50051
```

## Example grpcurl commands

### 1. Get stock

```bash
grpcurl -plaintext \
  -proto proto/inventory.proto \
  -d '{"sku":"SKU-RED-CHAIR"}' \
  localhost:50051 automation.inventory.v1.InventoryService/GetStock
```

### 2. Reserve stock

```bash
grpcurl -plaintext \
  -proto proto/inventory.proto \
  -d '{"sku":"SKU-RED-CHAIR","quantity":2,"reservationId":"res-100"}' \
  localhost:50051 automation.inventory.v1.InventoryService/ReserveStock
```

### 3. Verify reduced stock

```bash
grpcurl -plaintext \
  -proto proto/inventory.proto \
  -d '{"sku":"SKU-RED-CHAIR"}' \
  localhost:50051 automation.inventory.v1.InventoryService/GetStock
```

### 4. Release stock

```bash
grpcurl -plaintext \
  -proto proto/inventory.proto \
  -d '{"reservationId":"res-100"}' \
  localhost:50051 automation.inventory.v1.InventoryService/ReleaseStock
```

### 5. Reset inventory

```bash
grpcurl -plaintext \
  -proto proto/inventory.proto \
  -d '{}' \
  localhost:50051 automation.inventory.v1.InventoryService/ResetInventory
```

## Metadata practice

### Correlation ID

```bash
grpcurl -plaintext \
  -proto proto/inventory.proto \
  -H 'x-correlation-id: manual-test-001' \
  -d '{"sku":"SKU-BLUE-DESK"}' \
  localhost:50051 automation.inventory.v1.InventoryService/GetStock
```

### Inject deterministic failures

Supported `x-failure-mode` values:

- `unavailable`
- `resource_exhausted`
- `deadline_exceeded`
- `internal`

Example:

```bash
grpcurl -plaintext \
  -proto proto/inventory.proto \
  -H 'x-failure-mode: unavailable' \
  -d '{"sku":"SKU-RED-CHAIR"}' \
  localhost:50051 automation.inventory.v1.InventoryService/GetStock
```

## Good manual test ideas

- invalid input: blank SKU, zero quantity
- business failures: reserve more than available stock
- idempotency behavior with repeated `reservationId`
- correlation ID passthrough
- injected transient failures vs validation failures
- reserve, verify stock, release, verify stock restored

## What phase 1 does not include yet

- multi-service orchestration
- streaming RPCs
- server reflection
- health check service
- proto generation pipeline
- frontend UI integration for gRPC-backed flows

Those will be added in later phases.
