# gRPC Phase 1, 2, 3, and 4 Testing Guide

Phase 1 and 2 add real gRPC services to the backend on port `50051`.

## What was added

- `GetStock`
- `ReserveStock`
- `ReleaseStock`
- `ResetInventory`
- `GetQuote`
- `StreamQuotes`
- `CreateOrder`
- `GetOrder`
- `ListOrders`
- `ResetOrders`
- `IngestAuditEvents`
- `ListAuditEvents`
- `ResetAuditEvents`

Manual testing concepts now available:

- unary RPC testing
- request validation
- business error mapping
- metadata testing with correlation IDs
- deterministic fault injection with gRPC status codes
- stateful reserve/release workflow testing
- unary pricing validation and business-rule testing
- server-streaming practice with partial stream failure
- deadline and interval tuning practice for streaming RPCs
- multi-service orchestration and compensation logic
- idempotent order creation
- consistency checks after rollback
- client-streaming ingestion
- stream completion acknowledgement
- audit/event query and reset practice

## Start the backend

From `backend/`:

```bash
npm run build
npm start
```

Expected startup lines:

```text
API server running on 3001
gRPC inventory and pricing server running on 50051
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

## Phase 3 order orchestration examples

### 12. Create an order

```bash
grpcurl -plaintext \
  -proto proto/order.proto \
  -d '{"orderId":"order-100","sku":"SKU-RED-CHAIR","quantity":2,"currency":"USD"}' \
  localhost:50051 automation.order.v1.OrderService/CreateOrder
```

Expected:

- `order.orderId` is `order-100`
- `order.reservationId` is populated
- `order.status` is `created`
- pricing fields are present

### 13. Get the created order

```bash
grpcurl -plaintext \
  -proto proto/order.proto \
  -d '{"orderId":"order-100"}' \
  localhost:50051 automation.order.v1.OrderService/GetOrder
```

### 14. List all orders

```bash
grpcurl -plaintext \
  -proto proto/order.proto \
  -d '{}' \
  localhost:50051 automation.order.v1.OrderService/ListOrders
```

### 15. Test idempotent create

Run the same `CreateOrder` request twice with the same `orderId`.

Expected:

- the second response returns the same order
- no duplicate order is created

### 16. Inject pricing-step failure with rollback

```bash
grpcurl -plaintext \
  -proto proto/order.proto \
  -H 'x-order-failure-step: pricing' \
  -d '{"orderId":"order-fail-pricing","sku":"SKU-RED-CHAIR","quantity":1,"currency":"USD"}' \
  localhost:50051 automation.order.v1.OrderService/CreateOrder
```

Expected:

- gRPC error with status `INTERNAL`
- inventory should be restored because reservation rollback is performed

### 17. Inject persist-step failure with rollback

```bash
grpcurl -plaintext \
  -proto proto/order.proto \
  -H 'x-order-failure-step: persist' \
  -d '{"orderId":"order-fail-persist","sku":"SKU-BLUE-DESK","quantity":1,"currency":"USD"}' \
  localhost:50051 automation.order.v1.OrderService/CreateOrder
```

Expected:

- gRPC error with status `INTERNAL`
- no order should exist afterward
- inventory should be restored

### 18. Reset order state

```bash
grpcurl -plaintext \
  -proto proto/order.proto \
  -d '{}' \
  localhost:50051 automation.order.v1.OrderService/ResetOrders
```

## Phase 4 audit streaming examples

### 19. Ingest audit events with client streaming

Create a JSON lines file such as `audit-events.jsonl`:

```json
{"eventId":"evt-1","eventType":"order_created","entityId":"order-100","payload":"ok","eventTimeEpochMs":1710000000000}
{"eventId":"evt-2","eventType":"order_failed","entityId":"order-fail-pricing","payload":"rollback","eventTimeEpochMs":1710000001000}
```

Then run:

```bash
grpcurl -plaintext \
  -proto proto/audit.proto \
  -d @ \
  localhost:50051 automation.audit.v1.AuditService/IngestAuditEvents < audit-events.jsonl
```

Expected:

- one final unary response
- `acceptedCount` matches the number of streamed events
- `batchId` is populated

### 20. List all audit events

```bash
grpcurl -plaintext \
  -proto proto/audit.proto \
  -d '{}' \
  localhost:50051 automation.audit.v1.AuditService/ListAuditEvents
```

### 21. Filter audit events by type

```bash
grpcurl -plaintext \
  -proto proto/audit.proto \
  -d '{"eventType":"order_created"}' \
  localhost:50051 automation.audit.v1.AuditService/ListAuditEvents
```

### 22. Reset audit events

```bash
grpcurl -plaintext \
  -proto proto/audit.proto \
  -d '{}' \
  localhost:50051 automation.audit.v1.AuditService/ResetAuditEvents
```

## Phase 2 pricing examples

### 6. Get a unary price quote

```bash
grpcurl -plaintext \
  -proto proto/pricing.proto \
  -d '{"sku":"SKU-BLUE-DESK","quantity":3,"currency":"USD"}' \
  localhost:50051 automation.pricing.v1.PricingService/GetQuote
```

Expected:

- `quote.sku` is `SKU-BLUE-DESK`
- `quote.quantity` is `3`
- `quote.pricingRule` is `standard-price`

### 7. Get a discounted price quote

```bash
grpcurl -plaintext \
  -proto proto/pricing.proto \
  -d '{"sku":"SKU-BLUE-DESK","quantity":5,"currency":"USD"}' \
  localhost:50051 automation.pricing.v1.PricingService/GetQuote
```

Expected:

- `quote.pricingRule` is `bulk-5-discount`
- total price reflects the bulk discount

### 8. Stream quote updates

```bash
grpcurl -plaintext \
  -proto proto/pricing.proto \
  -d '{"sku":"SKU-RED-CHAIR","quantity":2,"currency":"USD","updatesCount":3,"intervalMs":200,"initialShiftBasisPoints":0,"stepBasisPoints":50}' \
  localhost:50051 automation.pricing.v1.PricingService/StreamQuotes
```

Expected:

- three streamed responses
- `sequenceNumber` increases from `1` to `3`
- the last item has `final: true`
- unit price changes as the market shift increases

### 9. Trigger partial stream failure

```bash
grpcurl -plaintext \
  -proto proto/pricing.proto \
  -d '{"sku":"SKU-RED-CHAIR","quantity":2,"currency":"USD","updatesCount":4,"intervalMs":100,"failAfterItem":2}' \
  localhost:50051 automation.pricing.v1.PricingService/StreamQuotes
```

Expected:

- two items stream successfully
- the stream then ends with `UNAVAILABLE`

### 10. Trigger deterministic unary failure through metadata

```bash
grpcurl -plaintext \
  -proto proto/pricing.proto \
  -H 'x-failure-mode: deadline_exceeded' \
  -d '{"sku":"SKU-RED-CHAIR","quantity":1,"currency":"USD"}' \
  localhost:50051 automation.pricing.v1.PricingService/GetQuote
```

Expected:

- gRPC error with status `DEADLINE_EXCEEDED`

### 11. Trigger validation failures

```bash
grpcurl -plaintext \
  -proto proto/pricing.proto \
  -d '{"sku":"","quantity":0,"currency":"USD"}' \
  localhost:50051 automation.pricing.v1.PricingService/GetQuote
```

Expected:

- gRPC error with status `INVALID_ARGUMENT`

```bash
grpcurl -plaintext \
  -proto proto/pricing.proto \
  -d '{"sku":"SKU-UNKNOWN","quantity":1,"currency":"USD"}' \
  localhost:50051 automation.pricing.v1.PricingService/GetQuote
```

Expected:

- gRPC error with status `NOT_FOUND`
