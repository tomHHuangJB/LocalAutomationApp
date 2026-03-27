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
};

function loadClient(port: number): GrpcClient {
  const inventoryProtoPath = fileURLToPath(new URL("../proto/inventory.proto", import.meta.url));
  const pricingProtoPath = fileURLToPath(new URL("../proto/pricing.proto", import.meta.url));
  const packageDefinition = protoLoader.loadSync([inventoryProtoPath, pricingProtoPath], {
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
  const inventoryClient = new loaded.automation.inventory.v1.InventoryService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const pricingClient = new loaded.automation.pricing.v1.PricingService(
    `localhost:${port}`,
    grpc.credentials.createInsecure()
  ) as GrpcClient;
  const inventoryClose = inventoryClient.close.bind(inventoryClient);
  const pricingClose = pricingClient.close.bind(pricingClient);

  return Object.assign(inventoryClient, {
    GetQuote: pricingClient.GetQuote.bind(pricingClient),
    StreamQuotes: pricingClient.StreamQuotes.bind(pricingClient),
    close: () => {
      inventoryClose();
      pricingClose();
    }
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

    const reset = await unary<{ items: Array<{ sku: string; available: number }> }>(client.ResetInventory.bind(client), {});
    expect(reset.items).toEqual(expect.arrayContaining([expect.objectContaining({ sku: "SKU-RED-CHAIR", available: 12 })]));

    const before = await unary<{ item: { available: number }; correlationId: string }>(
      client.GetStock.bind(client),
      { sku: "SKU-RED-CHAIR" },
      metadata
    );
    expect(before.item.available).toBe(12);
    expect(before.correlationId).toBe("inventory-check");

    const reserved = await unary<{ remainingStock: number; reservationId: string }>(client.ReserveStock.bind(client), {
      sku: "SKU-RED-CHAIR",
      quantity: 2,
      reservationId: "res-ci"
    });
    expect(reserved.remainingStock).toBe(10);

    const duplicate = await unary<{ remainingStock: number; reservationId: string }>(client.ReserveStock.bind(client), {
      sku: "SKU-RED-CHAIR",
      quantity: 2,
      reservationId: "res-ci"
    });
    expect(duplicate.reservationId).toBe("res-ci");
    expect(duplicate.remainingStock).toBe(10);

    const released = await unary<{ availableAfterRelease: number }>(client.ReleaseStock.bind(client), {
      reservationId: "res-ci"
    });
    expect(released.availableAfterRelease).toBe(12);
  });

  it("returns expected inventory gRPC errors", async () => {
    await expect(unary(client.GetStock.bind(client), { sku: "" })).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT
    });

    await expect(
      unary(client.ReserveStock.bind(client), { sku: "SKU-BLUE-DESK", quantity: 99, reservationId: "too-many" })
    ).rejects.toMatchObject({
      code: grpc.status.FAILED_PRECONDITION
    });

    await expect(unary(client.ReleaseStock.bind(client), { reservationId: "missing" })).rejects.toMatchObject({
      code: grpc.status.NOT_FOUND
    });

    const failureMetadata = new grpc.Metadata();
    failureMetadata.set("x-failure-mode", "resource_exhausted");
    await expect(unary(client.GetStock.bind(client), { sku: "SKU-RED-CHAIR" }, failureMetadata)).rejects.toMatchObject({
      code: grpc.status.RESOURCE_EXHAUSTED
    });
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

});
