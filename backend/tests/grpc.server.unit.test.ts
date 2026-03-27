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
    failureMetadata.set("x-api-key", "test-user-key");

    const getStockFailure = await invokeUnary(__testables.inventoryService.GetStock, { sku: "SKU-RED-CHAIR" }, failureMetadata);
    expect(getStockFailure.error?.code).toBe(grpc.status.INTERNAL);

    const getStockMissing = await invokeUnary(__testables.inventoryService.GetStock, { sku: "SKU-UNKNOWN" });
    expect(getStockMissing.error?.code).toBe(grpc.status.NOT_FOUND);

    const reserveFailure = await invokeUnary(__testables.inventoryService.ReserveStock, { sku: "SKU-RED-CHAIR", quantity: 1 }, failureMetadata);
    expect(reserveFailure.error?.code).toBe(grpc.status.INTERNAL);

    const reserveMissingAuth = await invokeUnary(__testables.inventoryService.ReserveStock, { sku: "SKU-RED-CHAIR", quantity: 1 });
    expect(reserveMissingAuth.error?.code).toBe(grpc.status.UNAUTHENTICATED);

    const userMetadata = new grpc.Metadata();
    userMetadata.set("x-api-key", "test-user-key");

    const reserveMissingSku = await invokeUnary(__testables.inventoryService.ReserveStock, { sku: "", quantity: 1 }, userMetadata);
    expect(reserveMissingSku.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const reserveBadQty = await invokeUnary(__testables.inventoryService.ReserveStock, { sku: "SKU-RED-CHAIR", quantity: 0 }, userMetadata);
    expect(reserveBadQty.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const releaseFailure = await invokeUnary(__testables.inventoryService.ReleaseStock, { reservationId: "res-any" }, failureMetadata);
    expect(releaseFailure.error?.code).toBe(grpc.status.INTERNAL);

    const releaseMissingId = await invokeUnary(__testables.inventoryService.ReleaseStock, { reservationId: "" }, userMetadata);
    expect(releaseMissingId.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const resetDenied = await invokeUnary(__testables.inventoryService.ResetInventory, {}, userMetadata);
    expect(resetDenied.error?.code).toBe(grpc.status.PERMISSION_DENIED);

    const adminFailure = new grpc.Metadata();
    adminFailure.set("x-api-key", "test-admin-key");
    adminFailure.set("x-failure-mode", "internal");
    const resetFailure = await invokeUnary(__testables.inventoryService.ResetInventory, {}, adminFailure);
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
    injectedMetadata.set("x-api-key", "test-user-key");
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
      metadata: injectedMetadata,
      destroy: (error: grpc.ServiceError) => failAfterErrors.push(error),
      write: (item: unknown) => writes.push(item),
      end: () => undefined
    });
    expect(failAfterErrors[0]?.code).toBe(grpc.status.DEADLINE_EXCEEDED);

    const authedMetadata = new grpc.Metadata();
    authedMetadata.set("x-api-key", "test-user-key");
    const authErrors: Array<grpc.ServiceError> = [];
    const authWrites: Array<unknown> = [];
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
      metadata: authedMetadata,
      destroy: (error: grpc.ServiceError) => authErrors.push(error),
      write: (item: unknown) => authWrites.push(item),
      end: () => undefined
    });
    expect(authWrites).toHaveLength(1);
    expect(authErrors[0]?.code).toBe(grpc.status.UNAVAILABLE);

    const validationErrors: Array<grpc.ServiceError> = [];
    await __testables.pricingService.StreamQuotes({
      request: {
        sku: "",
        quantity: 1,
        currency: "USD",
        updatesCount: 1,
        intervalMs: 0
      },
      metadata: authedMetadata,
      destroy: (error: grpc.ServiceError) => failAfterErrors.push(error),
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
    injectedMetadata.set("x-api-key", "test-user-key");
    const createInjected = await invokeUnary(
      __testables.orderService.CreateOrder,
      { orderId: "order-injected", sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" },
      injectedMetadata
    );
    expect(createInjected.error?.code).toBe(grpc.status.RESOURCE_EXHAUSTED);

    const missingAuth = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-missing-auth",
      sku: "SKU-RED-CHAIR",
      quantity: 1,
      currency: "USD"
    });
    expect(missingAuth.error?.code).toBe(grpc.status.UNAUTHENTICATED);

    const roleMismatch = new grpc.Metadata();
    roleMismatch.set("x-api-key", "test-user-key");
    roleMismatch.set("x-user-role", "admin");
    const mismatch = await invokeUnary(
      __testables.orderService.CreateOrder,
      { orderId: "order-role-mismatch", sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" },
      roleMismatch
    );
    expect(mismatch.error?.code).toBe(grpc.status.PERMISSION_DENIED);

    const userMetadata = new grpc.Metadata();
    userMetadata.set("x-api-key", "test-user-key");

    const missingSku = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-missing-sku",
      sku: "",
      quantity: 1,
      currency: "USD"
    }, userMetadata);
    expect(missingSku.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const badQuantity = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-bad-qty",
      sku: "SKU-RED-CHAIR",
      quantity: 0,
      currency: "USD"
    }, userMetadata);
    expect(badQuantity.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const created = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-existing",
      sku: "SKU-RED-CHAIR",
      quantity: 1,
      currency: "USD"
    }, userMetadata);
    expect((created.response as { order: { orderId: string } }).order.orderId).toBe("order-existing");

    const existing = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "order-existing",
      sku: "SKU-BLUE-DESK",
      quantity: 1,
      currency: "USD"
    }, userMetadata);
    expect((existing.response as { order: { orderId: string; sku: string } }).order.sku).toBe("SKU-RED-CHAIR");

    const pricingFailMetadata = new grpc.Metadata();
    pricingFailMetadata.set("x-order-failure-step", "pricing");
    pricingFailMetadata.set("x-api-key", "test-user-key");
    const pricingFailure = await invokeUnary(
      __testables.orderService.CreateOrder,
      { orderId: "order-pricing-fail", sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" },
      pricingFailMetadata
    );
    expect(pricingFailure.error?.code).toBe(grpc.status.INTERNAL);

    const persistFailMetadata = new grpc.Metadata();
    persistFailMetadata.set("x-order-failure-step", "persist");
    persistFailMetadata.set("x-api-key", "test-user-key");
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
    }, userMetadata);
    expect(unknownSku.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const getInjected = await invokeUnary(__testables.orderService.GetOrder, { orderId: "order-existing" }, injectedMetadata);
    expect(getInjected.error?.code).toBe(grpc.status.RESOURCE_EXHAUSTED);

    const getMissingId = await invokeUnary(__testables.orderService.GetOrder, { orderId: "" }, userMetadata);
    expect(getMissingId.error?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const got = await invokeUnary(__testables.orderService.GetOrder, { orderId: "order-existing" }, userMetadata);
    expect((got.response as { order: { orderId: string } }).order.orderId).toBe("order-existing");

    const getUnknown = await invokeUnary(__testables.orderService.GetOrder, { orderId: "missing-order" }, userMetadata);
    expect(getUnknown.error?.code).toBe(grpc.status.NOT_FOUND);

    const listInjected = await invokeUnary(__testables.orderService.ListOrders, {}, injectedMetadata);
    expect(listInjected.error?.code).toBe(grpc.status.RESOURCE_EXHAUSTED);

    const listed = await invokeUnary(__testables.orderService.ListOrders, {}, userMetadata);
    expect((listed.response as { orders: Array<unknown> }).orders.length).toBeGreaterThan(0);

    const resetDenied = await invokeUnary(__testables.orderService.ResetOrders, {}, userMetadata);
    expect(resetDenied.error?.code).toBe(grpc.status.PERMISSION_DENIED);

    const adminMetadata = new grpc.Metadata();
    adminMetadata.set("x-api-key", "test-admin-key");
    const reset = await invokeUnary(__testables.orderService.ResetOrders, {}, adminMetadata);
    expect((reset.response as { cleared: number }).cleared).toBeGreaterThan(0);
  });

  it("covers health handlers and response shaping", async () => {
    expect(__testables.healthResponse("automation.inventory.v1.InventoryService")).toEqual({ status: "SERVING" });
    expect(__testables.healthResponse("automation.unknown.v1.MissingService")).toEqual({ status: "SERVICE_UNKNOWN" });

    const failureMetadata = new grpc.Metadata();
    failureMetadata.set("x-failure-mode", "unavailable");

    const checkInjected = await invokeUnary(
      __testables.healthService.Check,
      { service: "automation.inventory.v1.InventoryService" },
      failureMetadata
    );
    expect(checkInjected.error?.code).toBe(grpc.status.UNAVAILABLE);

    const checkUnknown = await invokeUnary(__testables.healthService.Check, {
      service: "automation.unknown.v1.MissingService"
    });
    expect(checkUnknown.error?.code).toBe(grpc.status.NOT_FOUND);

    const checkKnown = await invokeUnary(__testables.healthService.Check, {
      service: "grpc.health.v1.Health"
    });
    expect(checkKnown.response).toEqual({ status: "SERVING" });

    const watchInjectedErrors: Array<grpc.ServiceError> = [];
    await __testables.healthService.Watch({
      request: { service: "grpc.health.v1.Health" },
      metadata: failureMetadata,
      destroy: (error: grpc.ServiceError) => watchInjectedErrors.push(error),
      write: () => undefined,
      end: () => undefined
    });
    expect(watchInjectedErrors[0]?.code).toBe(grpc.status.UNAVAILABLE);

    const watchWrites: Array<unknown> = [];
    let ended = 0;
    await __testables.healthService.Watch({
      request: { service: "automation.unknown.v1.MissingService" },
      metadata: new grpc.Metadata(),
      destroy: () => undefined,
      write: (item: unknown) => watchWrites.push(item),
      end: () => {
        ended += 1;
      }
    });
    expect(watchWrites).toEqual([{ status: "SERVICE_UNKNOWN" }]);
    expect(ended).toBe(1);
  });

  it("covers notification handlers and response shaping", async () => {
    expect(
      __testables.notificationRecordResponse(
        {
          messageId: "msg-1",
          channel: "ops",
          body: "hello",
          senderId: "bot-1",
          sequenceNumber: 1
        },
        "corr-notify",
        true
      )
    ).toEqual({
      broadcast: {
        messageId: "msg-1",
        channel: "ops",
        body: "hello",
        senderId: "bot-1",
        sequenceNumber: 1,
        replay: true,
        correlationId: "corr-notify"
      }
    });

    const injectedMetadata = new grpc.Metadata();
    injectedMetadata.set("x-failure-mode", "internal");
    injectedMetadata.set("x-api-key", "test-admin-key");

    const resetInjected = await invokeUnary(__testables.notificationService.ResetNotifications, {}, injectedMetadata);
    expect(resetInjected.error?.code).toBe(grpc.status.INTERNAL);

    const listInjected = await invokeUnary(__testables.notificationService.ListNotifications, { channel: "ops" }, injectedMetadata);
    expect(listInjected.error?.code).toBe(grpc.status.INTERNAL);

    const duplexFailureErrors: Array<grpc.ServiceError> = [];
    __testables.notificationService.Connect({
      metadata: injectedMetadata,
      on: () => undefined,
      write: () => undefined,
      end: () => undefined,
      destroy: (error: grpc.ServiceError) => duplexFailureErrors.push(error)
    });
    expect(duplexFailureErrors[0]?.code).toBe(grpc.status.INTERNAL);

    const handlers = new Map<string, Function>();
    const writes: Array<unknown> = [];
    const destroyErrors: Array<grpc.ServiceError> = [];
    let ended = 0;
    __testables.notificationService.Connect({
      metadata: new grpc.Metadata(),
      on: (event: string, handler: Function) => {
        handlers.set(event, handler);
        return undefined;
      },
      write: (payload: unknown) => writes.push(payload),
      end: () => {
        ended += 1;
      },
      destroy: (error: grpc.ServiceError) => destroyErrors.push(error)
    });

    expect(destroyErrors[0]?.code).toBe(grpc.status.UNAUTHENTICATED);

    const secondHandlers = new Map<string, Function>();
    const secondWrites: Array<unknown> = [];
    const secondDestroyErrors: Array<grpc.ServiceError> = [];
    const userMetadata = new grpc.Metadata();
    userMetadata.set("x-api-key", "test-user-key");
    __testables.notificationService.Connect({
      metadata: userMetadata,
      on: (event: string, handler: Function) => {
        secondHandlers.set(event, handler);
        return undefined;
      },
      write: (payload: unknown) => secondWrites.push(payload),
      end: () => {
        ended += 1;
      },
      destroy: (error: grpc.ServiceError) => secondDestroyErrors.push(error)
    });

    secondHandlers.get("data")?.({ subscribe: { clientId: "", channel: "ops", replayRecent: 0 } });
    expect(secondDestroyErrors[0]?.code).toBe(grpc.status.INVALID_ARGUMENT);

    const thirdHandlers = new Map<string, Function>();
    const thirdWrites: Array<unknown> = [];
    const thirdDestroyErrors: Array<grpc.ServiceError> = [];
    __testables.notificationService.Connect({
      metadata: userMetadata,
      on: (event: string, handler: Function) => {
        thirdHandlers.set(event, handler);
        return undefined;
      },
      write: (payload: unknown) => thirdWrites.push(payload),
      end: () => {
        ended += 1;
      },
      destroy: (error: grpc.ServiceError) => thirdDestroyErrors.push(error)
    });

    thirdHandlers.get("data")?.({ subscribe: { clientId: "sub-1", channel: "ops", replayRecent: 0 } });
    thirdHandlers.get("data")?.({
      publish: {
        messageId: "msg-2",
        channel: "ops",
        body: "hello",
        senderId: "bot-1",
        failAfterAckCount: 1
      }
    });
    expect(thirdWrites).toContainEqual(
      expect.objectContaining({ connected: expect.objectContaining({ clientId: "sub-1", channel: "ops" }) })
    );
    expect(thirdWrites).toContainEqual(
      expect.objectContaining({ ack: expect.objectContaining({ messageId: "msg-2", sequenceNumber: 1 }) })
    );
    expect(thirdWrites).toContainEqual(
      expect.objectContaining({ broadcast: expect.objectContaining({ messageId: "msg-2", replay: false }) })
    );
    expect(thirdDestroyErrors[0]?.code).toBe(grpc.status.UNAVAILABLE);

    thirdHandlers.get("error")?.(new Error("stream boom"));
    thirdHandlers.get("end")?.();
    expect(ended).toBeGreaterThan(0);
  });

  it("covers admin handlers", async () => {
    const failureMetadata = new grpc.Metadata();
    failureMetadata.set("x-failure-mode", "deadline_exceeded");
    failureMetadata.set("x-api-key", "test-admin-key");

    const snapshotInjected = await invokeUnary(__testables.adminService.GetSystemSnapshot, {}, failureMetadata);
    expect(snapshotInjected.error?.code).toBe(grpc.status.DEADLINE_EXCEEDED);

    const orderUserMetadata = new grpc.Metadata();
    orderUserMetadata.set("x-api-key", "test-user-key");

    const seededOrder = await invokeUnary(__testables.orderService.CreateOrder, {
      orderId: "admin-unit-order",
      sku: "SKU-RED-CHAIR",
      quantity: 1,
      currency: "USD"
    }, orderUserMetadata);
    expect((seededOrder.response as { order: { orderId: string } }).order.orderId).toBe("admin-unit-order");

    const adminMetadata = new grpc.Metadata();
    adminMetadata.set("x-api-key", "test-admin-key");

    const snapshot = await invokeUnary(__testables.adminService.GetSystemSnapshot, {}, adminMetadata);
    expect(snapshot.response).toMatchObject({
      inventory: expect.objectContaining({ skuCount: 3 }),
      orders: expect.objectContaining({ orderCount: 1 })
    });

    const resetInjected = await invokeUnary(__testables.adminService.ResetAllState, {}, failureMetadata);
    expect(resetInjected.error?.code).toBe(grpc.status.DEADLINE_EXCEEDED);

    const reset = await invokeUnary(__testables.adminService.ResetAllState, {}, adminMetadata);
    expect(reset.response).toMatchObject({
      clearedOrders: 1,
      remainingInventoryReservations: 0
    });

    const missingAuth = await invokeUnary(__testables.adminService.GetSystemSnapshot, {});
    expect(missingAuth.error?.code).toBe(grpc.status.UNAUTHENTICATED);

    const userMetadata = new grpc.Metadata();
    userMetadata.set("x-api-key", "test-user-key");
    const denied = await invokeUnary(__testables.adminService.GetSystemSnapshot, {}, userMetadata);
    expect(denied.error?.code).toBe(grpc.status.PERMISSION_DENIED);
  });
});
