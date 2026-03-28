import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "url";
import { jest } from "@jest/globals";
import { startGrpcServer, type StartedGrpcServer } from "../src/grpc/server.js";

jest.setTimeout(10000);

type GrpcClient = grpc.Client & {
  GetStock: Function;
  ReserveStock: Function;
  ReleaseStock: Function;
  ResetInventory: Function;
  GetQuote: Function;
  StreamQuotes: Function;
  CreateOrder: Function;
  GetOrder: Function;
  ListOrders: Function;
  ResetOrders: Function;
  IngestAuditEvents: Function;
  ListAuditEvents: Function;
  ResetAuditEvents: Function;
  Check: Function;
  Watch: Function;
  Connect: Function;
  ListNotifications: Function;
  ResetNotifications: Function;
  GetSystemSnapshot: Function;
  ResetAllState: Function;
  RunOrderWorkflow: Function;
  GetWorkflowRun: Function;
  ListWorkflowRuns: Function;
  ResetWorkflowRuns: Function;
  ExecuteUnstableOperation: Function;
  GetAttemptSnapshot: Function;
  ResetAttemptCounters: Function;
};

function loadClient(port: number): GrpcClient {
  const inventoryProtoPath = fileURLToPath(new URL("../proto/inventory.proto", import.meta.url));
  const pricingProtoPath = fileURLToPath(new URL("../proto/pricing.proto", import.meta.url));
  const orderProtoPath = fileURLToPath(new URL("../proto/order.proto", import.meta.url));
  const auditProtoPath = fileURLToPath(new URL("../proto/audit.proto", import.meta.url));
  const healthProtoPath = fileURLToPath(new URL("../proto/health.proto", import.meta.url));
  const notificationProtoPath = fileURLToPath(new URL("../proto/notification.proto", import.meta.url));
  const adminProtoPath = fileURLToPath(new URL("../proto/admin.proto", import.meta.url));
  const workflowProtoPath = fileURLToPath(new URL("../proto/workflow.proto", import.meta.url));
  const resiliencyProtoPath = fileURLToPath(new URL("../proto/resiliency.proto", import.meta.url));
  const packageDefinition = protoLoader.loadSync(
    [inventoryProtoPath, pricingProtoPath, orderProtoPath, auditProtoPath, healthProtoPath, notificationProtoPath, adminProtoPath, workflowProtoPath, resiliencyProtoPath],
    {
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
  );
  const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
  const inventoryClient = new loaded.automation.inventory.v1.InventoryService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const pricingClient = new loaded.automation.pricing.v1.PricingService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const orderClient = new loaded.automation.order.v1.OrderService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const auditClient = new loaded.automation.audit.v1.AuditService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const healthClient = new loaded.grpc.health.v1.Health(`localhost:${port}`, grpc.credentials.createInsecure()) as GrpcClient;
  const notificationClient = new loaded.automation.notification.v1.NotificationService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const adminClient = new loaded.automation.admin.v1.AdminService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const workflowClient = new loaded.automation.workflow.v1.WorkflowService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const resiliencyClient = new loaded.automation.resiliency.v1.ResiliencyService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const inventoryClose = inventoryClient.close.bind(inventoryClient);
  const pricingClose = pricingClient.close.bind(pricingClient);
  const orderClose = orderClient.close.bind(orderClient);
  const auditClose = auditClient.close.bind(auditClient);
  const healthClose = healthClient.close.bind(healthClient);
  const notificationClose = notificationClient.close.bind(notificationClient);
  const adminClose = adminClient.close.bind(adminClient);
  const workflowClose = workflowClient.close.bind(workflowClient);
  const resiliencyClose = resiliencyClient.close.bind(resiliencyClient);

  return Object.assign(inventoryClient, {
    GetQuote: pricingClient.GetQuote.bind(pricingClient),
    StreamQuotes: pricingClient.StreamQuotes.bind(pricingClient),
    CreateOrder: orderClient.CreateOrder.bind(orderClient),
    GetOrder: orderClient.GetOrder.bind(orderClient),
    ListOrders: orderClient.ListOrders.bind(orderClient),
    ResetOrders: orderClient.ResetOrders.bind(orderClient),
    IngestAuditEvents: auditClient.IngestAuditEvents.bind(auditClient),
    ListAuditEvents: auditClient.ListAuditEvents.bind(auditClient),
    ResetAuditEvents: auditClient.ResetAuditEvents.bind(auditClient),
    Check: healthClient.Check.bind(healthClient),
    Watch: healthClient.Watch.bind(healthClient),
    Connect: notificationClient.Connect.bind(notificationClient),
    ListNotifications: notificationClient.ListNotifications.bind(notificationClient),
    ResetNotifications: notificationClient.ResetNotifications.bind(notificationClient),
    GetSystemSnapshot: adminClient.GetSystemSnapshot.bind(adminClient),
    ResetAllState: adminClient.ResetAllState.bind(adminClient),
    RunOrderWorkflow: workflowClient.RunOrderWorkflow.bind(workflowClient),
    GetWorkflowRun: workflowClient.GetWorkflowRun.bind(workflowClient),
    ListWorkflowRuns: workflowClient.ListWorkflowRuns.bind(workflowClient),
    ResetWorkflowRuns: workflowClient.ResetWorkflowRuns.bind(workflowClient),
    ExecuteUnstableOperation: resiliencyClient.ExecuteUnstableOperation.bind(resiliencyClient),
    GetAttemptSnapshot: resiliencyClient.GetAttemptSnapshot.bind(resiliencyClient),
    ResetAttemptCounters: resiliencyClient.ResetAttemptCounters.bind(resiliencyClient),
    close: () => {
      inventoryClose();
      pricingClose();
      orderClose();
      auditClose();
      healthClose();
      notificationClose();
      adminClose();
      workflowClose();
      resiliencyClose();
    }
  });
}

function clientStream<TResponse>(
  fn: Function,
  items: Array<Record<string, unknown>>,
  metadata?: grpc.Metadata
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const stream = metadata
      ? fn(metadata, (error: grpc.ServiceError | null, response: TResponse) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(response);
        })
      : fn((error: grpc.ServiceError | null, response: TResponse) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(response);
        });

    for (const item of items) {
      stream.write(item);
    }
    stream.end();
  });
}

function unary<T>(fn: Function, request: unknown, metadata?: grpc.Metadata): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = (error: grpc.ServiceError | null, response: T) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    };

    if (metadata) {
      fn(request, metadata, callback);
      return;
    }
    fn(request, callback);
  });
}

function serverStream<T>(fn: Function, request: unknown, metadata?: grpc.Metadata): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const stream = metadata ? fn(request, metadata) : fn(request);
    const items: T[] = [];

    stream.on("data", (item: T) => items.push(item));
    stream.on("end", () => resolve(items));
    stream.on("error", (error: grpc.ServiceError) => reject(error));
  });
}

function waitForEvent<T>(
  getItems: () => T[],
  predicate: (item: T) => boolean,
  timeoutMs = 1000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const poll = () => {
      const match = getItems().find(predicate);
      if (match) {
        resolve(match);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Timed out waiting for expected stream event"));
        return;
      }

      const timer = setTimeout(poll, 10);
      timer.unref?.();
    };

    poll();
  });
}

function endClientStream(stream: grpc.ClientDuplexStream<any, any>): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      }
    };

    stream.once("end", finish);
    stream.once("close", finish);
    stream.once("error", finish);
    const timeout = setTimeout(() => {
      try {
        stream.cancel();
      } catch {
        // Ignore cancellation errors during test teardown.
      }
      finish();
    }, 250);
    timeout.unref?.();
    stream.end();
  });
}
function authMetadata(apiKey: string, role?: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set("x-api-key", apiKey);
  if (role) {
    metadata.set("x-user-role", role);
  }
  return metadata;
}

describe("gRPC integration", () => {
  let grpcServer: StartedGrpcServer;
  let client: GrpcClient;

  beforeAll(async () => {
    grpcServer = await startGrpcServer(0);
    client = loadClient(grpcServer.port);
  });

  afterAll(async () => {
    client.close();
    await grpcServer.shutdown();
  });

  it("handles inventory workflow and metadata passthrough", async () => {
    const metadata = new grpc.Metadata();
    metadata.set("x-correlation-id", "inventory-check");
    const securedUser = authMetadata("test-user-key", "user");

    const reset = await unary<{ items: Array<{ sku: string; available: number }> }>(
      client.ResetInventory.bind(client),
      {},
      authMetadata("test-admin-key", "admin")
    );
    expect(reset.items).toEqual(expect.arrayContaining([expect.objectContaining({ sku: "SKU-RED-CHAIR", available: 12 })]));

    const before = await unary<{ item: { available: number }; correlationId: string }>(
      client.GetStock.bind(client),
      { sku: "SKU-RED-CHAIR" },
      metadata
    );
    expect(before.item.available).toBe(12);
    expect(before.correlationId).toBe("inventory-check");

    const reserved = await unary<{ remainingStock: number; reservationId: string }>(
      client.ReserveStock.bind(client),
      {
        sku: "SKU-RED-CHAIR",
        quantity: 2,
        reservationId: "res-ci"
      },
      securedUser
    );
    expect(reserved.remainingStock).toBe(10);

    const duplicate = await unary<{ remainingStock: number; reservationId: string }>(
      client.ReserveStock.bind(client),
      {
        sku: "SKU-RED-CHAIR",
        quantity: 2,
        reservationId: "res-ci"
      },
      securedUser
    );
    expect(duplicate.reservationId).toBe("res-ci");
    expect(duplicate.remainingStock).toBe(10);

    const released = await unary<{ availableAfterRelease: number }>(
      client.ReleaseStock.bind(client),
      {
        reservationId: "res-ci"
      },
      securedUser
    );
    expect(released.availableAfterRelease).toBe(12);
  });

  it("returns expected inventory gRPC errors", async () => {
    await expect(
      unary(client.ReserveStock.bind(client), { sku: "SKU-RED-CHAIR", quantity: 1, reservationId: "missing-auth" })
    ).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED
    });

    await expect(unary(client.GetStock.bind(client), { sku: "" })).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT
    });

    await expect(
      unary(
        client.ReserveStock.bind(client),
        { sku: "SKU-BLUE-DESK", quantity: 99, reservationId: "too-many" },
        authMetadata("test-user-key", "user")
      )
    ).rejects.toMatchObject({
      code: grpc.status.FAILED_PRECONDITION
    });

    await expect(
      unary(client.ReleaseStock.bind(client), { reservationId: "missing" }, authMetadata("test-user-key", "user"))
    ).rejects.toMatchObject({ code: grpc.status.NOT_FOUND });

    await expect(
      unary(
        client.ResetInventory.bind(client),
        {},
        authMetadata("test-user-key", "user")
      )
    ).rejects.toMatchObject({ code: grpc.status.PERMISSION_DENIED });

    const failureMetadata = new grpc.Metadata();
    failureMetadata.set("x-failure-mode", "resource_exhausted");
    failureMetadata.set("x-api-key", "test-user-key");
    await expect(
      unary(client.ReserveStock.bind(client), { sku: "SKU-RED-CHAIR", quantity: 1, reservationId: "fail-auth" }, failureMetadata)
    ).rejects.toMatchObject({ code: grpc.status.RESOURCE_EXHAUSTED });
  });

  it("returns pricing quotes, handles validation, and surfaces metadata failures", async () => {
    const metadata = new grpc.Metadata();
    metadata.set("x-correlation-id", "pricing-check");

    const quote = await unary<{ quote: { pricingRule: string; totalPrice: { units: string } }; correlationId: string }>(
      client.GetQuote.bind(client),
      { sku: "SKU-BLUE-DESK", quantity: 5, currency: "USD", priceShiftBasisPoints: 0, delayMs: 1 },
      metadata
    );
    expect(quote.quote.pricingRule).toBe("bulk-5-discount");
    expect(quote.quote.totalPrice.units).toBeDefined();
    expect(quote.correlationId).toBe("pricing-check");

    await expect(
      unary(client.GetQuote.bind(client), { sku: "SKU-UNKNOWN", quantity: 1, currency: "USD" })
    ).rejects.toMatchObject({
      code: grpc.status.NOT_FOUND
    });

    await expect(
      unary(client.GetQuote.bind(client), { sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD", delayMs: 6001 })
    ).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT
    });

    const failureMetadata = new grpc.Metadata();
    failureMetadata.set("x-failure-mode", "deadline_exceeded");
    await expect(
      unary(client.GetQuote.bind(client), { sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" }, failureMetadata)
    ).rejects.toMatchObject({
      code: grpc.status.DEADLINE_EXCEEDED
    });
  });

  it("reports serving health for known services and not found for unknown services", async () => {
    const overall = await unary<{ status: string }>(client.Check.bind(client), { service: "" });
    expect(overall.status).toBe("SERVING");

    const inventory = await unary<{ status: string }>(client.Check.bind(client), {
      service: "automation.inventory.v1.InventoryService"
    });
    expect(inventory.status).toBe("SERVING");

    await expect(unary(client.Check.bind(client), { service: "automation.unknown.v1.MissingService" })).rejects.toMatchObject({
      code: grpc.status.NOT_FOUND
    });

    const watchedStatuses = await new Promise<string[]>((resolve, reject) => {
      const statuses: string[] = [];
      const stream = client.Watch({ service: "grpc.health.v1.Health" });
      stream.on("data", (message: { status: string }) => statuses.push(message.status));
      stream.on("end", () => resolve(statuses));
      stream.on("error", reject);
    });
    expect(watchedStatuses).toEqual(["SERVING"]);
  });

  it("supports notification bidirectional streaming, replay, and state inspection", async () => {
    await unary<{ cleared: number }>(client.ResetNotifications.bind(client), {}, authMetadata("test-admin-key", "admin"));

    const subscriber = client.Connect(authMetadata("test-user-key", "user"));
    const subscriberEvents: Array<{ connected?: { channel: string }; broadcast?: { messageId: string; replay?: boolean } }> = [];
    subscriber.on("data", (message: { connected?: { channel: string }; broadcast?: { messageId: string; replay?: boolean } }) => {
      subscriberEvents.push(message);
    });
    subscriber.on("error", () => undefined);

    subscriber.write({
      subscribe: {
        clientId: "sub-1",
        channel: "ops",
        replayRecent: 0
      }
    });

    await waitForEvent(
      () => subscriberEvents,
      (message) => Boolean(message.connected?.channel === "ops")
    );
    expect(subscriberEvents).toContainEqual(expect.objectContaining({ connected: expect.objectContaining({ channel: "ops" }) }));

    const publisher = client.Connect(authMetadata("test-user-key", "user"));
    const publisherEvents: Array<{ ack?: { messageId: string; sequenceNumber: number } }> = [];
    publisher.on("data", (message: { ack?: { messageId: string; sequenceNumber: number } }) => {
      publisherEvents.push(message);
    });
    publisher.on("error", () => undefined);

    publisher.write({
      publish: {
        messageId: "msg-ci-1",
        channel: "ops",
        body: "deployment completed",
        senderId: "bot-ci"
      }
    });

    await waitForEvent(
      () => publisherEvents,
      (message) => Boolean(message.ack?.messageId === "msg-ci-1")
    );
    await waitForEvent(
      () => subscriberEvents,
      (message) => Boolean(message.broadcast?.messageId === "msg-ci-1" && message.broadcast?.replay === false)
    );
    expect(publisherEvents).toContainEqual(
      expect.objectContaining({ ack: expect.objectContaining({ messageId: "msg-ci-1", sequenceNumber: 1 }) })
    );
    expect(subscriberEvents).toContainEqual(
      expect.objectContaining({ broadcast: expect.objectContaining({ messageId: "msg-ci-1", replay: false }) })
    );

    const replayClient = client.Connect(authMetadata("test-user-key", "user"));
    const replayEvents: Array<{ broadcast?: { messageId: string; replay?: boolean } }> = [];
    replayClient.on("data", (message: { broadcast?: { messageId: string; replay?: boolean } }) => {
      replayEvents.push(message);
    });
    replayClient.on("error", () => undefined);
    replayClient.write({
      subscribe: {
        clientId: "sub-2",
        channel: "ops",
        replayRecent: 1
      }
    });

    await waitForEvent(
      () => replayEvents,
      (message) => Boolean(message.broadcast?.messageId === "msg-ci-1" && message.broadcast?.replay === true)
    );
    expect(replayEvents).toContainEqual(
      expect.objectContaining({ broadcast: expect.objectContaining({ messageId: "msg-ci-1", replay: true }) })
    );

    const listed = await unary<{ notifications: Array<{ messageId: string; channel: string }> }>(
      client.ListNotifications.bind(client),
      { channel: "ops" },
      authMetadata("test-user-key", "user")
    );
    expect(listed.notifications).toEqual([expect.objectContaining({ messageId: "msg-ci-1", channel: "ops" })]);

    await Promise.all([endClientStream(subscriber), endClientStream(publisher), endClientStream(replayClient)]);
  });

  it("provides admin snapshot and reset across all gRPC-backed state", async () => {
    const adminMetadata = authMetadata("test-admin-key", "admin");
    const userMetadata = authMetadata("test-user-key", "user");
    const serviceMetadata = authMetadata("test-service-key", "service");

    await unary(client.ResetAllState.bind(client), {}, adminMetadata);

    await unary(client.ReserveStock.bind(client), {
      sku: "SKU-RED-CHAIR",
      quantity: 1,
      reservationId: "admin-res-1"
    }, userMetadata);

    await unary(client.GetQuote.bind(client), {
      sku: "SKU-BLUE-DESK",
      quantity: 1,
      currency: "USD"
    });

    await unary(client.CreateOrder.bind(client), {
      orderId: "admin-order-1",
      sku: "SKU-BLUE-DESK",
      quantity: 1,
      currency: "USD"
    }, userMetadata);

    await clientStream(client.IngestAuditEvents.bind(client), [
      {
        eventId: "evt-admin-1",
        eventType: "order_created",
        entityId: "order-admin-1",
        payload: "ok",
        eventTimeEpochMs: "1710000000000"
      }
    ], serviceMetadata);

    const notificationStream = client.Connect(userMetadata);
    notificationStream.on("error", () => undefined);
    notificationStream.write({
      publish: {
        messageId: "msg-admin-1",
        channel: "ops",
        body: "hello",
        senderId: "bot-admin"
      }
    });
    await endClientStream(notificationStream);

    const snapshot = await unary<{
      inventory: { skuCount: number; activeReservationCount: number };
      orders: { orderCount: number };
      audit: { eventCount: number };
      notifications: { notificationCount: number; activeChannelSubscriberCount: number };
    }>(client.GetSystemSnapshot.bind(client), {}, adminMetadata);
    expect(snapshot.inventory.skuCount).toBe(3);
    expect(snapshot.inventory.activeReservationCount).toBe(2);
    expect(snapshot.orders.orderCount).toBe(1);
    expect(snapshot.audit.eventCount).toBe(1);
    expect(snapshot.notifications.notificationCount).toBe(1);

    const reset = await unary<{
      clearedOrders: number;
      clearedAuditEvents: number;
      clearedNotifications: number;
      remainingInventoryReservations: number;
      inventory: Array<{ sku: string; available: number }>;
    }>(client.ResetAllState.bind(client), {}, adminMetadata);
    expect(reset.clearedOrders).toBe(1);
    expect(reset.clearedAuditEvents).toBe(1);
    expect(reset.clearedNotifications).toBe(1);
    expect(reset.remainingInventoryReservations).toBe(0);
    expect(reset.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ sku: "SKU-RED-CHAIR", available: 12 })]));
  });

  it("streams workflow lifecycle events and stores workflow runs", async () => {
    await unary(client.ResetAllState.bind(client), {}, authMetadata("test-admin-key", "admin"));

    const events = await serverStream<any>(
      client.RunOrderWorkflow.bind(client),
      {
        orderId: "workflow-order-1",
        sku: "SKU-RED-CHAIR",
        quantity: 1,
        currency: "USD",
        intervalMs: 0
      },
      authMetadata("test-user-key", "user")
    );

    expect(events.map((event) => event.step)).toEqual([
      "accepted",
      "inventory_reserved",
      "priced",
      "order_created",
      "audit_recorded",
      "notification_published",
      "completed"
    ]);

    const run = await unary<{ run: { orderId: string; finalStatus: string; events: Array<{ step: string }> } }>(
      client.GetWorkflowRun.bind(client),
      { orderId: "workflow-order-1" },
      authMetadata("test-user-key", "user")
    );
    expect(run.run.orderId).toBe("workflow-order-1");
    expect(run.run.finalStatus).toBe("completed");
    expect(run.run.events).toHaveLength(7);

    const listed = await unary<{ runs: Array<{ orderId: string }> }>(
      client.ListWorkflowRuns.bind(client),
      {},
      authMetadata("test-user-key", "user")
    );
    expect(listed.runs).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: "workflow-order-1" })]));
  });

  it("streams workflow failures, replays prior runs, and resets workflow state", async () => {
    await unary(client.ResetAllState.bind(client), {}, authMetadata("test-admin-key", "admin"));

    const failureMetadata = authMetadata("test-user-key", "user");
    failureMetadata.set("x-workflow-failure-step", "pricing");

    const failedEvents = await serverStream<any>(
      client.RunOrderWorkflow.bind(client),
      {
        orderId: "workflow-order-fail",
        sku: "SKU-BLUE-DESK",
        quantity: 1,
        currency: "USD",
        intervalMs: 0
      },
      failureMetadata
    );
    expect(failedEvents.at(-1)).toMatchObject({
      step: "failed",
      status: "failed",
      detail: "Injected workflow failure at pricing"
    });

    const replayedEvents = await serverStream<any>(
      client.RunOrderWorkflow.bind(client),
      {
        orderId: "workflow-order-fail",
        sku: "SKU-BLUE-DESK",
        quantity: 1,
        currency: "USD",
        intervalMs: 0
      },
      authMetadata("test-user-key", "user")
    );
    expect(replayedEvents).toHaveLength(failedEvents.length);

    const stock = await unary<{ item: { available: number } }>(client.GetStock.bind(client), {
      sku: "SKU-BLUE-DESK"
    });
    expect(stock.item.available).toBe(5);

    const reset = await unary<{ cleared: number }>(
      client.ResetWorkflowRuns.bind(client),
      {},
      authMetadata("test-admin-key", "admin")
    );
    expect(reset.cleared).toBeGreaterThanOrEqual(1);
  });

  it("supports workflow auto-cancellation and records cancelled final status", async () => {
    await unary(client.ResetAllState.bind(client), {}, authMetadata("test-admin-key", "admin"));

    const cancelledEvents = await serverStream<any>(
      client.RunOrderWorkflow.bind(client),
      {
        orderId: "workflow-order-cancel",
        sku: "SKU-RED-CHAIR",
        quantity: 1,
        currency: "USD",
        intervalMs: 0,
        autoCancelAfterStep: "priced"
      },
      authMetadata("test-user-key", "user")
    );

    expect(cancelledEvents.at(-1)).toMatchObject({
      step: "cancelled",
      status: "cancelled",
      detail: "workflow auto-cancelled after step priced"
    });

    const run = await unary<{ run: { finalStatus: string; events: Array<{ step: string }> } }>(
      client.GetWorkflowRun.bind(client),
      { orderId: "workflow-order-cancel" },
      authMetadata("test-user-key", "user")
    );
    expect(run.run.finalStatus).toBe("cancelled");
    expect(run.run.events.at(-1)?.step).toBe("cancelled");

    const stock = await unary<{ item: { available: number } }>(client.GetStock.bind(client), {
      sku: "SKU-RED-CHAIR"
    });
    expect(stock.item.available).toBe(12);
  });

  it("supports retryable resiliency scenarios and attempt snapshots", async () => {
    const adminMetadata = authMetadata("test-admin-key", "admin");
    const userMetadata = authMetadata("test-user-key", "user");

    await unary(client.ResetAttemptCounters.bind(client), {}, adminMetadata);

    await expect(
      unary(
        client.ExecuteUnstableOperation.bind(client),
        {
          operationKey: "retry-op-1",
          failUntilAttempt: 2,
          retryableCode: "UNAVAILABLE",
          processingDelayMs: 0
        },
        userMetadata
      )
    ).rejects.toMatchObject({ code: grpc.status.UNAVAILABLE });

    await expect(
      unary(
        client.ExecuteUnstableOperation.bind(client),
        {
          operationKey: "retry-op-1",
          failUntilAttempt: 2,
          retryableCode: "UNAVAILABLE",
          processingDelayMs: 0
        },
        userMetadata
      )
    ).rejects.toMatchObject({ code: grpc.status.UNAVAILABLE });

    const success = await unary<{ operationKey: string; attemptNumber: number; outcome: string }>(
      client.ExecuteUnstableOperation.bind(client),
      {
        operationKey: "retry-op-1",
        failUntilAttempt: 2,
        retryableCode: "UNAVAILABLE",
        processingDelayMs: 0
      },
      userMetadata
    );
    expect(success.attemptNumber).toBe(3);
    expect(success.outcome).toBe("succeeded");

    const snapshot = await unary<{ attempts: Array<{ operationKey: string; attemptCount: number }> }>(
      client.GetAttemptSnapshot.bind(client),
      { operationKey: "retry-op-1" },
      userMetadata
    );
    expect(snapshot.attempts).toEqual([expect.objectContaining({ operationKey: "retry-op-1", attemptCount: 3 })]);
  });

  it("supports deadline-style delay testing and resiliency auth/reset rules", async () => {
    const adminMetadata = authMetadata("test-admin-key", "admin");
    const userMetadata = authMetadata("test-user-key", "user");

    const delayed = await unary<{ attemptNumber: number; outcome: string }>(
      client.ExecuteUnstableOperation.bind(client),
      {
        operationKey: "deadline-op-1",
        failUntilAttempt: 0,
        retryableCode: "DEADLINE_EXCEEDED",
        processingDelayMs: 25
      },
      userMetadata
    );
    expect(delayed.attemptNumber).toBe(1);
    expect(delayed.outcome).toBe("succeeded");

    await expect(
      unary(client.ResetAttemptCounters.bind(client), {}, userMetadata)
    ).rejects.toMatchObject({ code: grpc.status.PERMISSION_DENIED });

    const reset = await unary<{ cleared: number }>(client.ResetAttemptCounters.bind(client), {}, adminMetadata);
    expect(reset.cleared).toBeGreaterThanOrEqual(1);
  });

  it("enforces metadata auth and role checks on protected gRPC methods", async () => {
    await expect(unary(client.GetSystemSnapshot.bind(client), {})).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED
    });

    await expect(
      unary(client.GetSystemSnapshot.bind(client), {}, authMetadata("test-user-key", "user"))
    ).rejects.toMatchObject({
      code: grpc.status.PERMISSION_DENIED
    });

    await expect(
      unary(client.ListAuditEvents.bind(client), { eventType: "" }, authMetadata("test-user-key", "user"))
    ).rejects.toMatchObject({
      code: grpc.status.PERMISSION_DENIED
    });

    await expect(
      unary(client.CreateOrder.bind(client), { orderId: "auth-order", sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" })
    ).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED
    });

    await expect(
      unary(client.CreateOrder.bind(client), { orderId: "auth-order", sku: "SKU-RED-CHAIR", quantity: 1, currency: "USD" }, authMetadata("test-user-key", "admin"))
    ).rejects.toMatchObject({
      code: grpc.status.PERMISSION_DENIED
    });
  });

});
