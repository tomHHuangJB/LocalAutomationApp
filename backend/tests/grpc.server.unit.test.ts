import grpc from "@grpc/grpc-js";
import { __testables } from "../src/grpc/server.js";

type UnaryCallback = (error: grpc.ServiceError | null, response: unknown | null) => void;

function invokeUnary(
  handler: (call: unknown, callback: UnaryCallback) => void | Promise<void>,
  request: Record<string, unknown>,
  metadata?: grpc.Metadata
): Promise<{ error: grpc.ServiceError | null; response: unknown | null }> {
  return new Promise((resolve) => {
    const call = {
      request,
      metadata: metadata ?? new grpc.Metadata()
    };
    const callback: UnaryCallback = (error, response) => resolve({ error, response });
    void handler(call, callback);
  });
}

describe("gRPC server handlers", () => {
  it("covers inventory validation and injected failure branches", async () => {
    const failureMetadata = new grpc.Metadata();
    failureMetadata.set("x-failure-mode", "internal");

    const getStockFailure = await invokeUnary(__testables.inventoryService.GetStock, { sku: "SKU-RED-CHAIR" }, failureMetadata);
    expect(getStockFailure.error?.code).toBe(grpc.status.INTERNAL);

    const getStockMissing = await invokeUnary(__testables.inventoryService.GetStock, { sku: "SKU-UNKNOWN" });
    expect(getStockMissing.error?.code).toBe(grpc.status.NOT_FOUND);

    const reserveFailure = await invokeUnary(__testables.inventoryService.ReserveStock, { sku: "SKU-RED-CHAIR", quantity: 1 }, failureMetadata);
    expect(reserveFailure.error?.code).toBe(grpc.status.INTERNAL);

    const reserveMissingSku = await invokeUnary(__testables.inventoryService.ReserveStock, { sku: "", quantity: 1 });
    expect(reserveMissingSku.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const reserveBadQty = await invokeUnary(__testables.inventoryService.ReserveStock, { sku: "SKU-RED-CHAIR", quantity: 0 });
    expect(reserveBadQty.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const releaseFailure = await invokeUnary(__testables.inventoryService.ReleaseStock, { reservationId: "res-any" }, failureMetadata);
    expect(releaseFailure.error?.code).toBe(grpc.status.INTERNAL);

    const releaseMissingId = await invokeUnary(__testables.inventoryService.ReleaseStock, { reservationId: "" });
    expect(releaseMissingId.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const resetFailure = await invokeUnary(__testables.inventoryService.ResetInventory, {}, failureMetadata);
    expect(resetFailure.error?.code).toBe(grpc.status.INTERNAL);
  });

  it("covers pricing unary failure and validation branches", async () => {
    const failureMetadata = new grpc.Metadata();
    failureMetadata.set("x-failure-mode", "unavailable");

    const pricingFailure = await invokeUnary(
      __testables.pricingService.GetQuote,
      { sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" },
      failureMetadata
    );
    expect(pricingFailure.error?.code).toBe(grpc.status.UNAVAILABLE);

    const pricingInvalid = await invokeUnary(__testables.pricingService.GetQuote, {
      sku: "SKU-RED-CHAIR",
      quantity: 1,
      currency: "USD",
      delayMs: 7000
    });
    expect(pricingInvalid.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const pricingUnknown = await invokeUnary(__testables.pricingService.GetQuote, {
      sku: "SKU-NOT-FOUND",
      quantity: 1,
      currency: "USD"
    });
    expect(pricingUnknown.error?.code).toBe(grpc.status.NOT_FOUND);
  });

  it("covers quote shaping and stream failure branches", async () => {
    const shaped = __testables.quoteResponse(
      {
        quoteId: "quote-1",
        sku: "SKU-RED-CHAIR",
        quantity: 2,
        currency: "USD",
        unitPriceCents: 12999,
        totalPriceCents: 25998,
        pricingRule: "standard-price"
      },
      "corr-1"
    );
    expect(shaped).toMatchObject({
      correlationId: "corr-1",
      quote: {
        quoteId: "quote-1",
        sku: "SKU-RED-CHAIR",
        quantity: 2,
        pricingRule: "standard-price"
      }
    });

    const injectedMetadata = new grpc.Metadata();
    injectedMetadata.set("x-failure-mode", "deadline_exceeded");
    const destroyedErrors: Array<grpc.ServiceError> = [];

    await __testables.pricingService.StreamQuotes({
      request: { sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD", updatesCount: 1, intervalMs: 0 },
      metadata: injectedMetadata,
      destroy: (error: grpc.ServiceError) => destroyedErrors.push(error),
      write: () => undefined,
      end: () => undefined
    });
    expect(destroyedErrors[0]?.code).toBe(grpc.status.DEADLINE_EXCEEDED);

    const failAfterErrors: Array<grpc.ServiceError> = [];
    const writes: Array<unknown> = [];
    await __testables.pricingService.StreamQuotes({
      request: {
        sku: "SKU-RED-CHAIR",
        quantity: 1,
        currency: "USD",
        updatesCount: 3,
        intervalMs: 0,
        failAfterItem: 1,
        initialShiftBasisPoints: 0,
        stepBasisPoints: 10
      },
      metadata: new grpc.Metadata(),
      destroy: (error: grpc.ServiceError) => failAfterErrors.push(error),
      write: (item: unknown) => writes.push(item),
      end: () => undefined
    });
    expect(writes).toHaveLength(1);
    expect(failAfterErrors[0]?.code).toBe(grpc.status.UNAVAILABLE);

    const validationErrors: Array<grpc.ServiceError> = [];
    await __testables.pricingService.StreamQuotes({
      request: {
        sku: "",
        quantity: 1,
        currency: "USD",
        updatesCount: 1,
        intervalMs: 0
      },
      metadata: new grpc.Metadata(),
      destroy: (error: grpc.ServiceError) => validationErrors.push(error),
      write: () => undefined,
      end: () => undefined
    });
    expect(validationErrors[0]?.code).toBe(grpc.status.INVALID_ARGUMENT);
  });

  it("covers order shaping and order handler branches", async () => {
    const shaped = __testables.orderResponse(
      {
        orderId: "order-1",
        reservationId: "res-order-1",
        sku: "SKU-RED-CHAIR",
        quantity: 2,
        currency: "USD",
        unitPriceCents: 12999,
        totalPriceCents: 25998,
        pricingRule: "standard-price",
        status: "created"
      },
      "corr-order"
    );
    expect(shaped).toMatchObject({
      correlationId: "corr-order",
      order: {
        orderId: "order-1",
        reservationId: "res-order-1",
        sku: "SKU-RED-CHAIR",
        status: "created"
      }
    });

    const injectedMetadata = new grpc.Metadata();
    injectedMetadata.set("x-failure-mode", "resource_exhausted");
    const createInjected = await invokeUnary(
      __testables.orderService.CreateOrder,
      { orderId: "order-injected", sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" },
      injectedMetadata
    );
    expect(createInjected.error?.code).toBe(grpc.status.RESOURCE_EXHAUSTED);

    const missingSku = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-missing-sku",
      sku: "",
      quantity: 1,
      currency: "USD"
    });
    expect(missingSku.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const badQuantity = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-bad-qty",
      sku: "SKU-RED-CHAIR",
      quantity: 0,
      currency: "USD"
    });
    expect(badQuantity.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const created = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-existing",
      sku: "SKU-RED-CHAIR",
      quantity: 1,
      currency: "USD"
    });
    expect((created.response as { order: { orderId: string } }).order.orderId).toBe("order-existing");

    const existing = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-existing",
      sku: "SKU-BLUE-DESK",
      quantity: 1,
      currency: "USD"
    });
    expect((existing.response as { order: { orderId: string; sku: string } }).order.sku).toBe("SKU-RED-CHAIR");

    const pricingFailMetadata = new grpc.Metadata();
    pricingFailMetadata.set("x-order-failure-step", "pricing");
    const pricingFailure = await invokeUnary(
      __testables.orderService.CreateOrder,
      { orderId: "order-pricing-fail", sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" },
      pricingFailMetadata
    );
    expect(pricingFailure.error?.code).toBe(grpc.status.INTERNAL);

    const persistFailMetadata = new grpc.Metadata();
    persistFailMetadata.set("x-order-failure-step", "persist");
    const persistFailure = await invokeUnary(
      __testables.orderService.CreateOrder,
      { orderId: "order-persist-fail", sku: "SKU-BLUE-DESK", quantity: 1, currency: "USD" },
      persistFailMetadata
    );
    expect(persistFailure.error?.code).toBe(grpc.status.INTERNAL);

    const unknownSku = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-unknown-sku",
      sku: "SKU-NOT-FOUND",
      quantity: 1,
      currency: "USD"
    });
    expect(unknownSku.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const getInjected = await invokeUnary(__testables.orderService.GetOrder, { orderId: "order-existing" }, injectedMetadata);
    expect(getInjected.error?.code).toBe(grpc.status.RESOURCE_EXHAUSTED);

    const getMissingId = await invokeUnary(__testables.orderService.GetOrder, { orderId: "" });
    expect(getMissingId.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const got = await invokeUnary(__testables.orderService.GetOrder, { orderId: "order-existing" });
    expect((got.response as { order: { orderId: string } }).order.orderId).toBe("order-existing");

    const getUnknown = await invokeUnary(__testables.orderService.GetOrder, { orderId: "missing-order" });
    expect(getUnknown.error?.code).toBe(grpc.status.NOT_FOUND);

    const listInjected = await invokeUnary(__testables.orderService.ListOrders, {}, injectedMetadata);
    expect(listInjected.error?.code).toBe(grpc.status.RESOURCE_EXHAUSTED);

    const listed = await invokeUnary(__testables.orderService.ListOrders, {});
    expect((listed.response as { orders: Array<unknown> }).orders.length).toBeGreaterThan(0);

    const resetInjected = await invokeUnary(__testables.orderService.ResetOrders, {}, injectedMetadata);
    expect(resetInjected.error?.code).toBe(grpc.status.RESOURCE_EXHAUSTED);

    const reset = await invokeUnary(__testables.orderService.ResetOrders, {});
    expect((reset.response as { cleared: number }).cleared).toBeGreaterThan(0);
  });
});
