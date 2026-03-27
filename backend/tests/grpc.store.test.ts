import grpc from "@grpc/grpc-js";
import { InventoryStore } from "../src/grpc/inventoryStore.js";
import { NotificationStore } from "../src/grpc/notificationStore.js";
import { OrderStore } from "../src/grpc/orderStore.js";
import { PricingStore, pricingValidationError, toMoney } from "../src/grpc/pricingStore.js";

describe("gRPC stores", () => {
  it("supports inventory reserve, idempotent reserve, release, and reset", () => {
    const store = new InventoryStore();

    expect(store.getStock("SKU-RED-CHAIR").available).toBe(12);

    const reserved = store.reserve("SKU-RED-CHAIR", 2, "res-1");
    expect(reserved.remainingStock).toBe(10);

    const idempotent = store.reserve("SKU-RED-CHAIR", 2, "res-1");
    expect(idempotent.remainingStock).toBe(10);

    const released = store.release("res-1");
    expect(released.availableAfterRelease).toBe(12);
    expect(store.reservationCount()).toBe(0);

    store.reset();
    expect(store.listStock()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: "SKU-RED-CHAIR", available: 12 }),
        expect.objectContaining({ sku: "SKU-BLUE-DESK", available: 5 }),
        expect.objectContaining({ sku: "SKU-GREEN-LAMP", available: 0 })
      ])
    );
    expect(store.reservationCount()).toBe(0);
  });

  it("raises inventory validation errors for unknown sku, low stock, and missing reservation", () => {
    const store = new InventoryStore();

    expect(() => store.getStock("SKU-UNKNOWN")).toThrow("Unknown SKU: SKU-UNKNOWN");
    expect(() => store.reserve("SKU-BLUE-DESK", 99, "res-2")).toThrow("Insufficient stock for SKU-BLUE-DESK");
    expect(() => store.release("missing")).toThrow("Unknown reservation: missing");
  });

  it("computes pricing rules, market shifts, stream defaults, and helper conversions", async () => {
    const store = new PricingStore();

    const standard = await store.getQuote({
      sku: "SKU-RED-CHAIR",
      quantity: 2,
      currency: "usd",
      shiftBasisPoints: 0,
      delayMs: 0
    });
    expect(standard.pricingRule).toBe("standard-price");
    expect(standard.currency).toBe("USD");

    const bulk = await store.getQuote({
      sku: "SKU-BLUE-DESK",
      quantity: 10,
      currency: "USD",
      shiftBasisPoints: 100,
      delayMs: 0
    });
    expect(bulk.pricingRule).toBe("bulk-10-discount+market-shift");
    expect(bulk.totalPriceCents).toBeGreaterThan(0);

    const streamed: string[] = [];
    for await (const quote of store.streamQuotes({
      sku: "SKU-GREEN-LAMP",
      quantity: 1,
      currency: "USD",
      updatesCount: 0,
      intervalMs: 0,
      initialShiftBasisPoints: 0,
      stepBasisPoints: 25
    })) {
      streamed.push(quote.pricingRule);
    }
    expect(streamed).toHaveLength(3);

    expect(toMoney("USD", 3499)).toEqual({ currency: "USD", units: 34, nanos: 990000000 });
    expect(pricingValidationError(new Error("Unknown SKU: SKU-404")).code).toBe(grpc.status.NOT_FOUND);
    expect(pricingValidationError(new Error("quantity must be a positive integer")).code).toBe(grpc.status.INVALID_ARGUMENT);
  });

  it("raises pricing validation errors for invalid requests", async () => {
    const store = new PricingStore();

    await expect(
      store.getQuote({
        sku: "",
        quantity: 1,
        currency: "USD",
        shiftBasisPoints: 0,
        delayMs: 0
      })
    ).rejects.toThrow("sku is required");

    await expect(
      store.getQuote({
        sku: "SKU-RED-CHAIR",
        quantity: 0,
        currency: "USD",
        shiftBasisPoints: 0,
        delayMs: 0
      })
    ).rejects.toThrow("quantity must be a positive integer");

    await expect(
      store.getQuote({
        sku: "SKU-RED-CHAIR",
        quantity: 1,
        currency: "USD",
        shiftBasisPoints: 6000,
        delayMs: 0
      })
    ).rejects.toThrow("priceShiftBasisPoints must be an integer between -5000 and 5000");

    await expect(
      store.getQuote({
        sku: "SKU-RED-CHAIR",
        quantity: 1,
        currency: "USD",
        shiftBasisPoints: 0,
        delayMs: 6000
      })
    ).rejects.toThrow("delayMs must be an integer between 0 and 5000");
  });

  it("supports order create, idempotent create, list, get, and reset", () => {
    const store = new OrderStore();

    const created = store.create({
      orderId: "order-1",
      reservationId: "res-order-1",
      sku: "SKU-RED-CHAIR",
      quantity: 2,
      currency: "USD",
      unitPriceCents: 12999,
      totalPriceCents: 25998,
      pricingRule: "standard-price",
      status: "created"
    });
    expect(created.orderId).toBe("order-1");

    const duplicate = store.create({
      orderId: "order-1",
      reservationId: "res-order-1b",
      sku: "SKU-BLUE-DESK",
      quantity: 1,
      currency: "USD",
      unitPriceCents: 100,
      totalPriceCents: 100,
      pricingRule: "ignored",
      status: "created"
    });
    expect(duplicate.sku).toBe("SKU-RED-CHAIR");

    expect(store.get("order-1").reservationId).toBe("res-order-1");
    expect(store.list()).toHaveLength(1);
    expect(store.reset()).toBe(1);
    expect(store.list()).toHaveLength(0);
  });

  it("raises order lookup error for unknown order", () => {
    const store = new OrderStore();
    expect(() => store.get("missing-order")).toThrow("Unknown order: missing-order");
  });

  it("supports notification publish, replay, list, and reset", () => {
    const store = new NotificationStore();

    const first = store.publish({
      messageId: "msg-1",
      channel: "ops",
      body: "deployment started",
      senderId: "bot-1"
    });
    const second = store.publish({
      messageId: "msg-2",
      channel: "ops",
      body: "deployment finished",
      senderId: "bot-1"
    });
    const other = store.publish({
      messageId: "msg-3",
      channel: "alerts",
      body: "cpu high",
      senderId: "monitor"
    });

    expect(first.sequenceNumber).toBe(1);
    expect(second.sequenceNumber).toBe(2);
    expect(other.sequenceNumber).toBe(1);

    expect(store.replay("ops", 1)).toEqual([expect.objectContaining({ messageId: "msg-2" })]);
    expect(store.list("ops")).toHaveLength(2);
    expect(store.list()).toHaveLength(3);
    expect(store.reset()).toBe(3);
    expect(store.list()).toHaveLength(0);
  });
});
