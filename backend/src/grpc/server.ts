import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { InventoryStore, type FailureMode } from "./inventoryStore.js";
import {
  PricingStore,
  pricingValidationError,
  toMoney,
  type ComputedQuote
} from "./pricingStore.js";

const inventoryProtoPath = fileURLToPath(new URL("../../proto/inventory.proto", import.meta.url));
const pricingProtoPath = fileURLToPath(new URL("../../proto/pricing.proto", import.meta.url));
const packageDefinition = protoLoader.loadSync([inventoryProtoPath, pricingProtoPath], {
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
const inventoryPackage = loaded.automation.inventory.v1;
const pricingPackage = loaded.automation.pricing.v1;

const store = new InventoryStore();
const pricingStore = new PricingStore();

function correlationIdFromMetadata(metadata: grpc.Metadata): string {
  const header = metadata.get("x-correlation-id")[0];
  return typeof header === "string" && header.length > 0 ? header : randomUUID();
}

function failureModeFromMetadata(metadata: grpc.Metadata): FailureMode {
  const header = metadata.get("x-failure-mode")[0];
  if (
    header === "unavailable" ||
    header === "resource_exhausted" ||
    header === "deadline_exceeded" ||
    header === "internal"
  ) {
    return header;
  }
  return "none";
}

function maybeFail(metadata: grpc.Metadata): grpc.ServiceError | undefined {
  const mode = failureModeFromMetadata(metadata);
  if (mode === "none") {
    return undefined;
  }

  const codeByMode: Record<Exclude<FailureMode, "none">, grpc.status> = {
    unavailable: grpc.status.UNAVAILABLE,
    resource_exhausted: grpc.status.RESOURCE_EXHAUSTED,
    deadline_exceeded: grpc.status.DEADLINE_EXCEEDED,
    internal: grpc.status.INTERNAL
  };

  return {
    name: "GrpcInjectedFailure",
    message: `Injected failure mode: ${mode}`,
    code: codeByMode[mode]
  } as grpc.ServiceError;
}

function validationError(message: string, code: grpc.status): grpc.ServiceError {
  return {
    name: "InventoryValidationError",
    message,
    code
  } as grpc.ServiceError;
}

const inventoryService = {
  GetStock(
    call: grpc.ServerUnaryCall<{ sku?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const sku = String(call.request?.sku ?? "").trim();
    if (!sku) {
      callback(validationError("sku is required", grpc.status.INVALID_ARGUMENT), null);
      return;
    }

    try {
      const item = store.getStock(sku);
      callback(null, {
        item,
        correlationId: correlationIdFromMetadata(call.metadata)
      });
    } catch (error) {
      callback(validationError((error as Error).message, grpc.status.NOT_FOUND), null);
    }
  },

  ReserveStock(
    call: grpc.ServerUnaryCall<{ sku?: string; quantity?: number; reservationId?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const sku = String(call.request?.sku ?? "").trim();
    const quantity = Number(call.request?.quantity ?? 0);
    const reservationId = String(call.request?.reservationId ?? "").trim() || randomUUID();

    if (!sku) {
      callback(validationError("sku is required", grpc.status.INVALID_ARGUMENT), null);
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      callback(validationError("quantity must be a positive integer", grpc.status.INVALID_ARGUMENT), null);
      return;
    }

    try {
      const reservation = store.reserve(sku, quantity, reservationId);
      callback(null, {
        reservationId: reservation.reservationId,
        sku: reservation.sku,
        reservedQuantity: reservation.quantity,
        remainingStock: reservation.remainingStock,
        correlationId: correlationIdFromMetadata(call.metadata)
      });
    } catch (error) {
      const message = (error as Error).message;
      const code = message.startsWith("Insufficient stock") ? grpc.status.FAILED_PRECONDITION : grpc.status.NOT_FOUND;
      callback(validationError(message, code), null);
    }
  },

  ReleaseStock(
    call: grpc.ServerUnaryCall<{ reservationId?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const reservationId = String(call.request?.reservationId ?? "").trim();
    if (!reservationId) {
      callback(validationError("reservationId is required", grpc.status.INVALID_ARGUMENT), null);
      return;
    }

    try {
      const released = store.release(reservationId);
      callback(null, {
        reservationId: released.reservationId,
        sku: released.sku,
        releasedQuantity: released.quantity,
        availableAfterRelease: released.availableAfterRelease,
        correlationId: correlationIdFromMetadata(call.metadata)
      });
    } catch (error) {
      callback(validationError((error as Error).message, grpc.status.NOT_FOUND), null);
    }
  },

  ResetInventory(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    store.reset();
    callback(null, {
      items: store.listStock(),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  }
};

function quoteResponse(quote: ComputedQuote, correlationId: string) {
  return {
    quote: {
      quoteId: quote.quoteId,
      sku: quote.sku,
      quantity: quote.quantity,
      unitPrice: toMoney(quote.currency, quote.unitPriceCents),
      totalPrice: toMoney(quote.currency, quote.totalPriceCents),
      pricingRule: quote.pricingRule
    },
    correlationId
  };
}

const pricingService = {
  async GetQuote(
    call: grpc.ServerUnaryCall<
      {
        sku?: string;
        quantity?: number;
        currency?: string;
        priceShiftBasisPoints?: number;
        delayMs?: number;
      },
      unknown
    >,
    callback: grpc.sendUnaryData<unknown>
  ): Promise<void> {
    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    try {
      const quote = await pricingStore.getQuote({
        sku: String(call.request?.sku ?? ""),
        quantity: Number(call.request?.quantity ?? 0),
        currency: String(call.request?.currency ?? "USD"),
        shiftBasisPoints: Number(call.request?.priceShiftBasisPoints ?? 0),
        delayMs: Number(call.request?.delayMs ?? 0)
      });
      callback(null, quoteResponse(quote, correlationIdFromMetadata(call.metadata)));
    } catch (error) {
      const serviceError = pricingValidationError(error as Error);
      callback(serviceError, null);
    }
  },

  async StreamQuotes(
    call: grpc.ServerWritableStream<
      {
        sku?: string;
        quantity?: number;
        currency?: string;
        updatesCount?: number;
        intervalMs?: number;
        initialShiftBasisPoints?: number;
        stepBasisPoints?: number;
        failAfterItem?: number;
      },
      unknown
    >
  ): Promise<void> {
    const injected = maybeFail(call.metadata);
    if (injected) {
      call.destroy(injected);
      return;
    }

    const correlationId = correlationIdFromMetadata(call.metadata);

    try {
      const stream = pricingStore.streamQuotes({
        sku: String(call.request?.sku ?? ""),
        quantity: Number(call.request?.quantity ?? 0),
        currency: String(call.request?.currency ?? "USD"),
        updatesCount: Number(call.request?.updatesCount ?? 0),
        intervalMs: Number(call.request?.intervalMs ?? 0),
        initialShiftBasisPoints: Number(call.request?.initialShiftBasisPoints ?? 0),
        stepBasisPoints: Number(call.request?.stepBasisPoints ?? 0)
      });

      const failAfterItem = Number(call.request?.failAfterItem ?? 0);
      let sequenceNumber = 0;

      for await (const quote of stream) {
        sequenceNumber += 1;

        if (failAfterItem > 0 && sequenceNumber > failAfterItem) {
          call.destroy({
            name: "PricingStreamFailure",
            message: `Injected stream failure after item ${failAfterItem}`,
            code: grpc.status.UNAVAILABLE
          } as grpc.ServiceError);
          return;
        }

        call.write({
          ...quoteResponse(quote, correlationId),
          sequenceNumber,
          final: sequenceNumber === Number(call.request?.updatesCount ?? 0)
        });
      }

      call.end();
    } catch (error) {
      const serviceError = pricingValidationError(error as Error);
      call.destroy(serviceError);
    }
  }
};

export const __testables = {
  inventoryService,
  pricingService,
  quoteResponse
};

export type StartedGrpcServer = {
  port: number;
  shutdown: () => Promise<void>;
};

export async function startGrpcServer(port = Number(process.env.GRPC_PORT ?? 50051)): Promise<StartedGrpcServer> {
  const server = new grpc.Server();
  server.addService(inventoryPackage.InventoryService.service, inventoryService);
  server.addService(pricingPackage.PricingService.service, pricingService);

  const boundPort = await new Promise<number>((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, actualPort) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(actualPort);
    });
  });

  console.log(`gRPC inventory and pricing server running on ${boundPort}`);

  return {
    port: boundPort,
    shutdown: () =>
      new Promise<void>((resolve, reject) => {
        server.tryShutdown((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}
