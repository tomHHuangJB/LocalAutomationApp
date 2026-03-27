import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { InventoryStore, type FailureMode } from "./inventoryStore.js";

const inventoryProtoPath = fileURLToPath(new URL("../../proto/inventory.proto", import.meta.url));
const packageDefinition = protoLoader.loadSync(inventoryProtoPath, {
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
const inventoryPackage = loaded.automation.inventory.v1;

const store = new InventoryStore();

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

export type StartedGrpcServer = {
  port: number;
  shutdown: () => Promise<void>;
};

export async function startGrpcServer(port = Number(process.env.GRPC_PORT ?? 50051)): Promise<StartedGrpcServer> {
  const server = new grpc.Server();
  server.addService(inventoryPackage.InventoryService.service, inventoryService);

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  console.log(`gRPC inventory server running on ${port}`);

  return {
    port,
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
