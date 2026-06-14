import request from "supertest";
import { app, server } from "../src/index.js";
import WebSocket from "ws";
import { jest } from "@jest/globals";

jest.setTimeout(10000);

function closeServer(listener: ReturnType<typeof server.listen>): Promise<void> {
  return new Promise((resolve, reject) => {
    listener.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function closeWebSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
    socket.close();
  });
}

describe("Local Automation Lab API", () => {
  it("returns health status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("logs in and returns tokens", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "principal.engineer", password: "demo" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it("covers auth and session endpoints", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ username: "principal.engineer", password: "demo" });
    expect(login.status).toBe(200);

    expect((await agent.post("/api/auth/refresh")).status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    expect((await request(app).post("/api/auth/refresh")).status).toBe(401);
    expect((await request(app).post("/api/auth/logout")).status).toBe(200);
    expect((await request(app).get("/api/auth/sessions")).status).toBe(200);
    expect((await request(app).post("/api/auth/forgot")).status).toBe(200);
    expect((await request(app).post("/api/auth/reset")).status).toBe(200);
    const lockout = await request(app).post("/api/auth/lockout");
    expect(lockout.status).toBe(423);
  });

  it("validates data create", async () => {
    const res = await request(app).post("/api/data").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("creates data", async () => {
    const res = await request(app).post("/api/data").send({ name: "Gamma" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Gamma");
  });

  it("updates and deletes data", async () => {
    const updated = await request(app).put("/api/data/1").send({ name: "Updated" });
    expect(updated.status).toBe(200);
    const deleted = await request(app).delete("/api/data/1");
    expect(deleted.status).toBe(200);
  });

  it("covers batch, flags, pagination and idempotency", async () => {
    expect((await request(app).post("/api/batch")).status).toBe(200);
    expect((await request(app).get("/api/flags")).status).toBe(200);
    expect((await request(app).get("/api/pagination")).status).toBe(200);
    const idempotent = await request(app).post("/api/idempotent").set("Idempotency-Key", "demo");
    expect(idempotent.status).toBe(200);
  });

  it("supports business data flow integrity across normalized tables and downstream consumer", async () => {
    const createPayload = {
      customer: {
        externalId: "cust-integrity-001",
        name: "Integrity Customer",
        email: "integrity.customer@example.com"
      },
      items: [
        { sku: "BOND-AAA", quantity: 2, unitPrice: 10.5 },
        { sku: "BOND-BBB", quantity: 3, unitPrice: 7 }
      ],
      payment: {
        provider: "test-pay",
        authorizationCode: "AUTH-INTEGRITY"
      },
      currency: "USD"
    };

    const created = await request(app)
      .post("/api/business-flow/orders")
      .set("X-Correlation-ID", "corr-integrity-001")
      .send(createPayload);

    expect(created.status).toBe(201);
    expect(created.body.orderId).toBeDefined();
    expect(created.body.correlationId).toBe("corr-integrity-001");
    expect(created.body.totalAmount).toBe(42);
    expect(created.body.persistedTables).toEqual(
      expect.arrayContaining([
        "business_customers",
        "business_orders",
        "business_order_items",
        "business_payments",
        "business_order_status_history",
        "downstream_consumer_events"
      ])
    );

    const integrity = await request(app).get(`/api/business-flow/orders/${created.body.orderId}/integrity`);
    expect(integrity.status).toBe(200);
    expect(integrity.body.passed).toBe(true);
    expect(integrity.body.tableCounts).toMatchObject({
      customers: 1,
      orders: 1,
      items: 2,
      payments: 1,
      downstreamEvents: 1
    });
    expect(integrity.body.calculated).toMatchObject({
      itemTotal: 42,
      paymentTotal: 42,
      orderTotal: 42
    });

    const loaded = await request(app).get(`/api/business-flow/orders/${created.body.orderId}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.customer).toMatchObject(createPayload.customer);
    expect(loaded.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: "BOND-AAA", quantity: 2, unitPrice: 10.5, lineTotal: 21 }),
        expect.objectContaining({ sku: "BOND-BBB", quantity: 3, unitPrice: 7, lineTotal: 21 })
      ])
    );
    expect(loaded.body.payments[0]).toMatchObject({
      provider: "test-pay",
      amount: 42,
      status: "AUTHORIZED",
      authorizationCode: "AUTH-INTEGRITY"
    });

    const downstream = await request(app).get(`/api/downstream/consumer-events/${created.body.correlationId}`);
    expect(downstream.status).toBe(200);
    expect(downstream.body.events[0]).toMatchObject({
      orderId: created.body.orderId,
      consumerName: "portfolio-risk-consumer",
      eventType: "ORDER_CREATED"
    });
    expect(downstream.body.events[0].payload).toMatchObject({
      correlationId: "corr-integrity-001",
      orderId: created.body.orderId,
      itemCount: 2,
      totalQuantity: 5,
      totalAmount: 42,
      status: "CREATED"
    });
  });

  it("exposes DB inspection, ETL run, and warehouse facts for data testing", async () => {
    await request(app).post("/api/reset");

    const createPayload = {
      customer: {
        externalId: "cust-etl-001",
        name: "ETL Customer",
        email: "etl.customer@example.com"
      },
      items: [
        { sku: "ETF-AAA", quantity: 4, unitPrice: 3.25 },
        { sku: "ETF-BBB", quantity: 1, unitPrice: 9.5 }
      ],
      payment: {
        provider: "warehouse-pay",
        authorizationCode: "AUTH-ETL"
      },
      currency: "USD"
    };

    const created = await request(app)
      .post("/api/business-flow/orders")
      .set("X-Correlation-ID", "corr-etl-001")
      .send(createPayload);

    expect(created.status).toBe(201);
    expect(created.body.orderId).toBeDefined();
    expect(created.body.totalAmount).toBe(22.5);

    const tableRows = await request(app).get(`/api/test/db/orders/${created.body.orderId}/tables`);
    expect(tableRows.status).toBe(200);
    expect(tableRows.body.dbPath).toBeDefined();
    expect(tableRows.body.tables.customers[0]).toMatchObject({
      external_id: "cust-etl-001",
      name: "ETL Customer",
      email: "etl.customer@example.com"
    });
    expect(tableRows.body.tables.orders[0]).toMatchObject({
      id: created.body.orderId,
      correlation_id: "corr-etl-001",
      total_amount: 22.5
    });
    expect(tableRows.body.tables.items).toHaveLength(2);
    expect(tableRows.body.tables.payments[0]).toMatchObject({
      provider: "warehouse-pay",
      amount: 22.5,
      authorization_code: "AUTH-ETL"
    });
    expect(tableRows.body.tables.downstreamEvents[0]).toMatchObject({
      delivery_status: "DELIVERED",
      attempt_count: 1
    });

    const namedQuery = await request(app).get("/api/test/db/query?name=business_order_integrity");
    expect(namedQuery.status).toBe(200);
    expect(namedQuery.body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          order_id: created.body.orderId,
          correlation_id: "corr-etl-001",
          customer_external_id: "cust-etl-001",
          order_total: 22.5,
          item_total: 22.5,
          payment_total: 22.5,
          item_count: 2,
          downstream_event_count: 1
        })
      ])
    );

    const etl = await request(app).post("/api/etl/run/orders");
    expect(etl.status).toBe(201);
    expect(etl.body.run).toMatchObject({
      status: "COMPLETED",
      source_count: 1,
      target_count: 1,
      error_count: 0
    });

    const run = await request(app).get(`/api/etl/runs/${etl.body.run.id}`);
    expect(run.status).toBe(200);
    expect(run.body.run.id).toBe(etl.body.run.id);
    expect(run.body.errors).toEqual([]);

    const warehouse = await request(app).get(`/api/warehouse/orders/${created.body.orderNumber}`);
    expect(warehouse.status).toBe(200);
    expect(warehouse.body).toMatchObject({
      source_order_id: created.body.orderId,
      order_number: created.body.orderNumber,
      correlation_id: "corr-etl-001",
      customer_external_id: "cust-etl-001",
      item_count: 2,
      total_quantity: 5,
      total_amount: 22.5,
      payment_amount: 22.5,
      downstream_event_count: 1,
      data_quality_status: "PASS"
    });

    const warehouseRows = await request(app).get("/api/warehouse/orders");
    expect(warehouseRows.status).toBe(200);
    expect(warehouseRows.body.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ source_order_id: created.body.orderId })])
    );

    const unknownQuery = await request(app).get("/api/test/db/query?name=missing");
    expect(unknownQuery.status).toBe(400);
  });

  it("validates business data flow create payloads", async () => {
    const res = await request(app).post("/api/business-flow/orders").send({ customer: { name: "Missing fields" } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.details.errors).toContain("customer.externalId is required");
    expect(res.body.error.details.errors).toContain("at least one item is required");
  });

  it("covers consistency and partial content", async () => {
    expect((await request(app).get("/api/consistency")).status).toBe(200);
    const partial = await request(app).get("/api/partial");
    expect(partial.status).toBe(206);
  });

  it("covers deterministic failures and patterns", async () => {
    const failed = await request(app).get("/api/data?failProbability=1");
    expect(failed.status).toBe(500);
    process.env.FAILURE_PATTERN = "F";
    const patternFail = await request(app).get("/api/data?failurePattern=F");
    expect(patternFail.status).toBe(500);
    process.env.FAILURE_PATTERN = "";
  });

  it("simulates race and dedup", async () => {
    const race = await request(app).get("/api/race?label=fast&delay=1");
    expect(race.status).toBe(200);
    expect(race.body.label).toBe("fast");

    const first = await request(app).get("/api/dedup?key=demo");
    const second = await request(app).get("/api/dedup?key=demo");
    expect(first.body.deduped).toBe(false);
    expect(second.body.deduped).toBe(true);
  });

  it("covers slow and large payload endpoints", async () => {
    const slow = await request(app).get("/api/slow?min=1&max=1");
    expect(slow.status).toBe(200);
    const payload = await request(app).get("/api/large-payload");
    expect(payload.status).toBe(200);
  });

  it("covers flaky endpoint (forced success)", async () => {
    const rand = jest.spyOn(Math, "random").mockReturnValue(0.9);
    const flaky = await request(app).get("/api/flaky");
    expect(flaky.status).toBe(200);
    rand.mockRestore();
  });

  it("handles upload chunk and completion", async () => {
    const uploadId = "upload-123";
    const chunk = await request(app)
      .post("/api/upload/chunk")
      .set("upload-id", uploadId)
      .set("chunk-index", "1")
      .set("total-chunks", "1");
    expect(chunk.status).toBe(200);
    expect(chunk.body.received).toBe(1);

    const complete = await request(app).post("/api/upload/complete").set("upload-id", uploadId);
    expect(complete.status).toBe(200);
    expect(complete.body.complete).toBe(true);
  });

  it("handles basic upload endpoint", async () => {
    const res = await request(app).post("/api/upload");
    expect(res.status).toBe(200);
  });

  it("returns download with checksum header", async () => {
    const res = await request(app).get("/api/download/report?checksum=bad");
    expect(res.status).toBe(200);
    expect(res.headers["x-checksum-sha256"]).toBeDefined();
  });

  it("covers system endpoints", async () => {
    expect((await request(app).get("/api/permissions")).status).toBe(200);
    expect((await request(app).get("/api/roles")).status).toBe(200);
    expect((await request(app).get("/api/time-skew")).status).toBe(200);
    expect((await request(app).post("/api/reset")).status).toBe(200);
    expect((await request(app).post("/api/seed").send({ seed: 123 })).status).toBe(200);
  });

  it("returns security injection output", async () => {
    const res = await request(app).get("/api/security/injection?type=sql&input=SELECT%20*%20FROM%20users");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("executed");
  });

  it("covers security endpoints", async () => {
    expect((await request(app).get("/api/security/injection?type=nosql&input=test")).status).toBe(200);
    expect((await request(app).get("/api/security/access-control?role=admin")).status).toBe(200);
    expect((await request(app).get("/api/security/access-control?role=viewer")).status).toBe(403);
    expect((await request(app).get("/api/security/xss?mode=raw")).status).toBe(200);
    expect((await request(app).get("/api/security/misconfig")).status).toBe(200);
    expect((await request(app).get("/api/security/vulnerable")).status).toBe(200);
    expect((await request(app).get("/api/security/ssrf?url=http://internal.service")).status).toBe(200);
    expect((await request(app).get("/api/security/crypto")).status).toBe(200);
    expect((await request(app).get("/api/security/logging")).status).toBe(200);
    const headers = await request(app).get("/api/security/headers");
    expect(headers.status).toBe(200);
    const redirectOk = await request(app).get("/api/security/redirect?target=/");
    expect(redirectOk.status).toBe(302);
    const redirectBad = await request(app).get("/api/security/redirect?target=http://evil.com");
    expect(redirectBad.status).toBe(400);
    expect((await request(app).post("/api/csp-report").send({ report: { blocked: true } })).status).toBe(200);
  });

  it("serves CSP test page", async () => {
    const res = await request(app).get("/csp-test");
    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("streams server-sent events", async () => {
    const res = await request(app).get("/api/stream?interval=10&count=2");
    expect(res.status).toBe(200);
    expect(res.text).toContain("message-1");
  });

  it("accepts WebSocket connections when enabled", async () => {
    process.env.ENABLE_WEBSOCKETS = "true";
    const listener = server.listen(0);
    try {
      await new Promise<void>((resolve, reject) => {
        listener.once("error", reject);
        listener.once("listening", () => resolve());
      });
      const address = listener.address();
      const port = typeof address === "string" ? 0 : address?.port;
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      try {
        const message = await new Promise<string>((resolve, reject) => {
          ws.once("error", reject);
          ws.once("message", (data) => resolve(String(data)));
        });
        expect(message).toContain("Notification");
      } finally {
        await closeWebSocket(ws);
      }
    } finally {
      process.env.ENABLE_WEBSOCKETS = "false";
      await closeServer(listener);
    }
  });
});
