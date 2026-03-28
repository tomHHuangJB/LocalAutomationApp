import grpc from "@grpc/grpc-js";
import { ReflectionService } from "@grpc/reflection";
import protoLoader from "@grpc/proto-loader";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { AuditStore, type StoredAuditEvent } from "./auditStore.js";
import { InventoryStore, type FailureMode } from "./inventoryStore.js";
import { NotificationStore, type StoredNotification } from "./notificationStore.js";
import { OrderStore, type StoredOrder } from "./orderStore.js";
import {
  PricingStore,
  pricingValidationError,
  toMoney,
  type ComputedQuote
} from "./pricingStore.js";
import { ResiliencyStore } from "./resiliencyStore.js";
import { WorkflowStore, type StoredWorkflowEvent, type StoredWorkflowRun } from "./workflowStore.js";

const inventoryProtoPath = fileURLToPath(new URL("../../proto/inventory.proto", import.meta.url));
const pricingProtoPath = fileURLToPath(new URL("../../proto/pricing.proto", import.meta.url));
const orderProtoPath = fileURLToPath(new URL("../../proto/order.proto", import.meta.url));
const auditProtoPath = fileURLToPath(new URL("../../proto/audit.proto", import.meta.url));
const healthProtoPath = fileURLToPath(new URL("../../proto/health.proto", import.meta.url));
const notificationProtoPath = fileURLToPath(new URL("../../proto/notification.proto", import.meta.url));
const adminProtoPath = fileURLToPath(new URL("../../proto/admin.proto", import.meta.url));
const workflowProtoPath = fileURLToPath(new URL("../../proto/workflow.proto", import.meta.url));
const resiliencyProtoPath = fileURLToPath(new URL("../../proto/resiliency.proto", import.meta.url));
const packageDefinition = protoLoader.loadSync(
  [
    inventoryProtoPath,
    pricingProtoPath,
    orderProtoPath,
    auditProtoPath,
    healthProtoPath,
    notificationProtoPath,
    adminProtoPath,
    workflowProtoPath,
    resiliencyProtoPath
  ],
  {
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);
const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
const inventoryPackage = loaded.automation.inventory.v1;
const pricingPackage = loaded.automation.pricing.v1;
const orderPackage = loaded.automation.order.v1;
const auditPackage = loaded.automation.audit.v1;
const healthPackage = loaded.grpc.health.v1;
const notificationPackage = loaded.automation.notification.v1;
const adminPackage = loaded.automation.admin.v1;
const workflowPackage = loaded.automation.workflow.v1;
const resiliencyPackage = loaded.automation.resiliency.v1;

const auditStore = new AuditStore();
const store = new InventoryStore();
const pricingStore = new PricingStore();
const orderStore = new OrderStore();
const notificationStore = new NotificationStore();
const workflowStore = new WorkflowStore();
const resiliencyStore = new ResiliencyStore();
const notificationSubscribers = new Map<string, Set<grpc.ServerDuplexStream<unknown, unknown>>>();

const knownHealthServices = new Set([
  "",
  "automation.inventory.v1.InventoryService",
  "automation.pricing.v1.PricingService",
  "automation.order.v1.OrderService",
  "automation.audit.v1.AuditService",
  "grpc.health.v1.Health",
  "automation.notification.v1.NotificationService",
  "automation.admin.v1.AdminService",
  "automation.workflow.v1.WorkflowService",
  "automation.resiliency.v1.ResiliencyService"
]);

const apiKeyRoles = new Map<string, "admin" | "user" | "service">([
  ["test-admin-key", "admin"],
  ["test-user-key", "user"],
  ["test-service-key", "service"]
]);

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

function authError(message: string, code: grpc.status): grpc.ServiceError {
  return {
    name: "GrpcAuthError",
    message,
    code
  } as grpc.ServiceError;
}

function requireAuth(metadata: grpc.Metadata, allowedRoles?: Array<"admin" | "user" | "service">): grpc.ServiceError | undefined {
  const apiKey = metadata.get("x-api-key")[0];
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return authError("x-api-key is required", grpc.status.UNAUTHENTICATED);
  }

  const role = apiKeyRoles.get(apiKey);
  if (!role) {
    return authError("invalid x-api-key", grpc.status.UNAUTHENTICATED);
  }

  const requestedRole = metadata.get("x-user-role")[0];
  if (typeof requestedRole === "string" && requestedRole.length > 0 && requestedRole !== role) {
    return authError("x-user-role does not match the authenticated principal", grpc.status.PERMISSION_DENIED);
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return authError(`role ${role} is not allowed`, grpc.status.PERMISSION_DENIED);
  }

  return undefined;
}

function validationError(message: string, code: grpc.status): grpc.ServiceError {
  return {
    name: "InventoryValidationError",
    message,
    code
  } as grpc.ServiceError;
}

function orderValidationError(message: string, code: grpc.status): grpc.ServiceError {
  return {
    name: "OrderValidationError",
    message,
    code
  } as grpc.ServiceError;
}

function orderFailureStepFromMetadata(metadata: grpc.Metadata): string {
  const header = metadata.get("x-order-failure-step")[0];
  return typeof header === "string" ? header : "";
}

function auditValidationError(message: string, code: grpc.status): grpc.ServiceError {
  return {
    name: "AuditValidationError",
    message,
    code
  } as grpc.ServiceError;
}

function healthStatusForService(serviceName: string): grpc.status | undefined {
  return knownHealthServices.has(serviceName) ? undefined : grpc.status.NOT_FOUND;
}

function healthResponse(serviceName: string) {
  if (!knownHealthServices.has(serviceName)) {
    return {
      status: "SERVICE_UNKNOWN"
    };
  }

  return {
    status: "SERVING"
  };
}

function notificationValidationError(message: string, code: grpc.status): grpc.ServiceError {
  return {
    name: "NotificationValidationError",
    message,
    code
  } as grpc.ServiceError;
}

function notificationRecordResponse(notification: StoredNotification, correlationId: string, replay = false) {
  return {
    broadcast: {
      messageId: notification.messageId,
      channel: notification.channel,
      body: notification.body,
      senderId: notification.senderId,
      sequenceNumber: notification.sequenceNumber,
      replay,
      correlationId
    }
  };
}

function workflowFailureStepFromMetadata(metadata: grpc.Metadata): string {
  const header = metadata.get("x-workflow-failure-step")[0];
  return typeof header === "string" ? header : "";
}

function workflowEventResponse(run: StoredWorkflowRun, event: StoredWorkflowEvent) {
  return {
    runId: run.runId,
    orderId: run.orderId,
    step: event.step,
    status: event.status,
    detail: event.detail,
    sequenceNumber: event.sequenceNumber,
    correlationId: event.correlationId
  };
}

function workflowRunResponse(run: StoredWorkflowRun) {
  return {
    runId: run.runId,
    orderId: run.orderId,
    sku: run.sku,
    quantity: run.quantity,
    currency: run.currency,
    finalStatus: run.finalStatus,
    events: run.events.map((event) => workflowEventResponse(run, event))
  };
}

function resiliencyCodeToStatus(code: string): grpc.status {
  switch (code.trim().toUpperCase()) {
    case "UNAVAILABLE":
      return grpc.status.UNAVAILABLE;
    case "RESOURCE_EXHAUSTED":
      return grpc.status.RESOURCE_EXHAUSTED;
    case "ABORTED":
      return grpc.status.ABORTED;
    case "DEADLINE_EXCEEDED":
      return grpc.status.DEADLINE_EXCEEDED;
    default:
      return grpc.status.UNAVAILABLE;
  }
}

function addSubscriber(channel: string, call: grpc.ServerDuplexStream<unknown, unknown>): void {
  const subscribers = notificationSubscribers.get(channel) ?? new Set();
  subscribers.add(call);
  notificationSubscribers.set(channel, subscribers);
}

function removeSubscriber(channel: string, call: grpc.ServerDuplexStream<unknown, unknown>): void {
  const subscribers = notificationSubscribers.get(channel);
  if (!subscribers) {
    return;
  }
  subscribers.delete(call);
  if (subscribers.size === 0) {
    notificationSubscribers.delete(channel);
  }
}

function broadcastNotification(channel: string, event: unknown): void {
  for (const subscriber of notificationSubscribers.get(channel) ?? []) {
    subscriber.write(event);
  }
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
    const authFailure = requireAuth(call.metadata, ["user", "service", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

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
    const authFailure = requireAuth(call.metadata, ["user", "service", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

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
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

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

function orderResponse(order: StoredOrder, correlationId: string) {
  return {
    order: {
      orderId: order.orderId,
      reservationId: order.reservationId,
      sku: order.sku,
      quantity: order.quantity,
      unitPrice: toMoney(order.currency, order.unitPriceCents),
      totalPrice: toMoney(order.currency, order.totalPriceCents),
      currency: order.currency,
      pricingRule: order.pricingRule,
      status: order.status
    },
    correlationId
  };
}

function auditEventResponse(event: StoredAuditEvent) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    entityId: event.entityId,
    payload: event.payload,
    eventTimeEpochMs: event.eventTimeEpochMs
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
    const authFailure = requireAuth(call.metadata, ["user", "service", "admin"]);
    if (authFailure) {
      call.destroy(authFailure);
      return;
    }

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

const orderService = {
  async CreateOrder(
    call: grpc.ServerUnaryCall<
      {
        orderId?: string;
        sku?: string;
        quantity?: number;
        currency?: string;
        priceShiftBasisPoints?: number;
      },
      unknown
    >,
    callback: grpc.sendUnaryData<unknown>
  ): Promise<void> {
    const authFailure = requireAuth(call.metadata, ["user", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const correlationId = correlationIdFromMetadata(call.metadata);
    const failureStep = orderFailureStepFromMetadata(call.metadata);
    const orderId = String(call.request?.orderId ?? "").trim() || randomUUID();
    const sku = String(call.request?.sku ?? "").trim();
    const quantity = Number(call.request?.quantity ?? 0);
    const currency = String(call.request?.currency ?? "USD");
    const priceShiftBasisPoints = Number(call.request?.priceShiftBasisPoints ?? 0);
    const reservationId = `res-${orderId}`;

    try {
      if (!sku) {
        throw orderValidationError("sku is required", grpc.status.INVALID_ARGUMENT);
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw orderValidationError("quantity must be a positive integer", grpc.status.INVALID_ARGUMENT);
      }

      const existing = orderStore.list().find((order) => order.orderId === orderId);
      if (existing) {
        callback(null, orderResponse(existing, correlationId));
        return;
      }

      const reservation = store.reserve(sku, quantity, reservationId);

      try {
        if (failureStep === "pricing") {
          throw new Error("Injected pricing step failure");
        }

        const quote = await pricingStore.getQuote({
          sku,
          quantity,
          currency,
          shiftBasisPoints: priceShiftBasisPoints,
          delayMs: 0
        });

        if (failureStep === "persist") {
          throw new Error("Injected persist step failure");
        }

        const order = orderStore.create({
          orderId,
          reservationId: reservation.reservationId,
          sku: reservation.sku,
          quantity: reservation.quantity,
          currency: quote.currency,
          unitPriceCents: quote.unitPriceCents,
          totalPriceCents: quote.totalPriceCents,
          pricingRule: quote.pricingRule,
          status: "created"
        });

        callback(null, orderResponse(order, correlationId));
      } catch (error) {
        store.release(reservation.reservationId);
        if (error instanceof Error && error.message.startsWith("Injected ")) {
          callback(orderValidationError(error.message, grpc.status.INTERNAL), null);
          return;
        }
        const serviceError = pricingValidationError(error as Error);
        callback(serviceError, null);
      }
    } catch (error) {
      const serviceError = (error as grpc.ServiceError).code
        ? (error as grpc.ServiceError)
        : orderValidationError((error as Error).message, grpc.status.INVALID_ARGUMENT);
      callback(serviceError, null);
    }
  },

  GetOrder(
    call: grpc.ServerUnaryCall<{ orderId?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["user", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const orderId = String(call.request?.orderId ?? "").trim();
    if (!orderId) {
      callback(orderValidationError("orderId is required", grpc.status.INVALID_ARGUMENT), null);
      return;
    }

    try {
      const order = orderStore.get(orderId);
      callback(null, orderResponse(order, correlationIdFromMetadata(call.metadata)));
    } catch (error) {
      callback(orderValidationError((error as Error).message, grpc.status.NOT_FOUND), null);
    }
  },

  ListOrders(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["user", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      orders: orderStore.list().map((order) => orderResponse(order, "").order),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  },

  ResetOrders(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      cleared: orderStore.reset(),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  }
};

const auditService = {
  IngestAuditEvents(
    call: grpc.ServerReadableStream<
      {
        eventId?: string;
        eventType?: string;
        entityId?: string;
        payload?: string;
        eventTimeEpochMs?: number | string;
      },
      unknown
    >,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["service", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const correlationId = correlationIdFromMetadata(call.metadata);
    const batchId = randomUUID();
    const acceptedEvents: StoredAuditEvent[] = [];
    let settled = false;

    call.on("data", (event) => {
      if (settled) {
        return;
      }

      const eventType = String(event.eventType ?? "").trim();
      const entityId = String(event.entityId ?? "").trim();
      const payload = String(event.payload ?? "");
      const rawTime = Number(event.eventTimeEpochMs ?? 0);
      const eventTimeEpochMs = Number.isFinite(rawTime) && rawTime > 0 ? rawTime : Date.now();
      const eventId = String(event.eventId ?? "").trim() || randomUUID();

      if (!eventType) {
        settled = true;
        callback(auditValidationError("eventType is required", grpc.status.INVALID_ARGUMENT), null);
        return;
      }
      if (!entityId) {
        settled = true;
        callback(auditValidationError("entityId is required", grpc.status.INVALID_ARGUMENT), null);
        return;
      }

      acceptedEvents.push(
        auditStore.add({
          eventId,
          eventType,
          entityId,
          payload,
          eventTimeEpochMs
        })
      );
    });

    call.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      callback(null, {
        acceptedCount: acceptedEvents.length,
        batchId,
        correlationId
      });
    });

    call.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(error as grpc.ServiceError, null);
    });
  },

  ListAuditEvents(
    call: grpc.ServerUnaryCall<{ eventType?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["service", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const eventType = String(call.request?.eventType ?? "").trim();
    callback(null, {
      events: auditStore.list(eventType || undefined).map(auditEventResponse),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  },

  ResetAuditEvents(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      cleared: auditStore.reset(),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  }
};

const healthService = {
  Check(
    call: grpc.ServerUnaryCall<{ service?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const serviceName = String(call.request?.service ?? "");
    const healthErrorCode = healthStatusForService(serviceName);
    if (healthErrorCode) {
      callback(validationError(`unknown service: ${serviceName}`, healthErrorCode), null);
      return;
    }

    callback(null, healthResponse(serviceName));
  },

  Watch(call: grpc.ServerWritableStream<{ service?: string }, unknown>): void {
    const injected = maybeFail(call.metadata);
    if (injected) {
      call.destroy(injected);
      return;
    }

    const serviceName = String(call.request?.service ?? "");
    call.write(healthResponse(serviceName));
    call.end();
  }
};

const notificationService = {
  Connect(
    call: grpc.ServerDuplexStream<
      {
        subscribe?: { clientId?: string; channel?: string; replayRecent?: number };
        publish?: { messageId?: string; channel?: string; body?: string; senderId?: string; failAfterAckCount?: number };
      },
      unknown
    >
  ): void {
    const authFailure = requireAuth(call.metadata, ["user", "service", "admin"]);
    if (authFailure) {
      call.destroy(authFailure);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      call.destroy(injected);
      return;
    }

    const correlationId = correlationIdFromMetadata(call.metadata);
    const subscribedChannels = new Set<string>();
    let ackCount = 0;

    call.on("data", (request) => {
      const subscribe = request.subscribe;
      const publish = request.publish;

      if (subscribe) {
        const clientId = String(subscribe.clientId ?? "").trim();
        const channel = String(subscribe.channel ?? "").trim();
        const replayRecent = Number(subscribe.replayRecent ?? 0);

        if (!clientId) {
          call.destroy(notificationValidationError("clientId is required", grpc.status.INVALID_ARGUMENT));
          return;
        }
        if (!channel) {
          call.destroy(notificationValidationError("channel is required", grpc.status.INVALID_ARGUMENT));
          return;
        }

        if (!subscribedChannels.has(channel)) {
          subscribedChannels.add(channel);
          addSubscriber(channel, call as grpc.ServerDuplexStream<unknown, unknown>);
        }

        call.write({
          connected: {
            clientId,
            channel,
            correlationId
          }
        });

        for (const replayed of notificationStore.replay(channel, replayRecent)) {
          call.write(notificationRecordResponse(replayed, correlationId, true));
        }
        return;
      }

      if (publish) {
        const channel = String(publish.channel ?? "").trim();
        const body = String(publish.body ?? "");
        const senderId = String(publish.senderId ?? "").trim();
        const messageId = String(publish.messageId ?? "").trim() || randomUUID();
        const failAfterAckCount = Number(publish.failAfterAckCount ?? 0);

        if (!channel) {
          call.destroy(notificationValidationError("channel is required", grpc.status.INVALID_ARGUMENT));
          return;
        }
        if (!body) {
          call.destroy(notificationValidationError("body is required", grpc.status.INVALID_ARGUMENT));
          return;
        }
        if (!senderId) {
          call.destroy(notificationValidationError("senderId is required", grpc.status.INVALID_ARGUMENT));
          return;
        }

        const stored = notificationStore.publish({
          messageId,
          channel,
          body,
          senderId
        });

        ackCount += 1;
        call.write({
          ack: {
            messageId: stored.messageId,
            channel: stored.channel,
            sequenceNumber: stored.sequenceNumber,
            correlationId
          }
        });

        broadcastNotification(channel, notificationRecordResponse(stored, correlationId));

        if (failAfterAckCount > 0 && ackCount >= failAfterAckCount) {
          call.destroy(notificationValidationError(`Injected notification failure after ack ${ackCount}`, grpc.status.UNAVAILABLE));
        }
        return;
      }

      call.destroy(notificationValidationError("notification request payload is required", grpc.status.INVALID_ARGUMENT));
    });

    call.on("end", () => {
      for (const channel of subscribedChannels) {
        removeSubscriber(channel, call as grpc.ServerDuplexStream<unknown, unknown>);
      }
      call.end();
    });

    call.on("error", () => {
      for (const channel of subscribedChannels) {
        removeSubscriber(channel, call as grpc.ServerDuplexStream<unknown, unknown>);
      }
    });
  },

  ListNotifications(
    call: grpc.ServerUnaryCall<{ channel?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["user", "service", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const channel = String(call.request?.channel ?? "").trim();
    callback(null, {
      notifications: notificationStore.list(channel || undefined).map((notification) => ({
        messageId: notification.messageId,
        channel: notification.channel,
        body: notification.body,
        senderId: notification.senderId,
        sequenceNumber: notification.sequenceNumber
      })),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  },

  ResetNotifications(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      cleared: notificationStore.reset(),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  }
};

const workflowService = {
  async RunOrderWorkflow(
    call: grpc.ServerWritableStream<
      {
        orderId?: string;
        sku?: string;
        quantity?: number;
        currency?: string;
        intervalMs?: number;
        priceShiftBasisPoints?: number;
        autoCancelAfterStep?: string;
      },
      unknown
    >
  ): Promise<void> {
    const authFailure = requireAuth(call.metadata, ["user", "admin"]);
    if (authFailure) {
      call.destroy(authFailure);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      call.destroy(injected);
      return;
    }

    const correlationId = correlationIdFromMetadata(call.metadata);
    const failureStep = workflowFailureStepFromMetadata(call.metadata);
    const orderId = String(call.request?.orderId ?? "").trim() || randomUUID();
    const sku = String(call.request?.sku ?? "").trim();
    const quantity = Number(call.request?.quantity ?? 0);
    const currency = String(call.request?.currency ?? "USD");
    const intervalMs = Number(call.request?.intervalMs ?? 0);
    const priceShiftBasisPoints = Number(call.request?.priceShiftBasisPoints ?? 0);
    const autoCancelAfterStep = String(call.request?.autoCancelAfterStep ?? "").trim();

    if (!sku) {
      call.destroy(orderValidationError("sku is required", grpc.status.INVALID_ARGUMENT));
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      call.destroy(orderValidationError("quantity must be a positive integer", grpc.status.INVALID_ARGUMENT));
      return;
    }
    if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 2000) {
      call.destroy(orderValidationError("intervalMs must be an integer between 0 and 2000", grpc.status.INVALID_ARGUMENT));
      return;
    }

    try {
      const existingRun = workflowStore.getByOrderId(orderId);
      for (const event of existingRun.events) {
        call.write(workflowEventResponse(existingRun, event));
      }
      call.end();
      return;
    } catch {
      // No prior workflow run for this order.
    }

    const run = workflowStore.create({
      runId: randomUUID(),
      orderId,
      sku,
      quantity,
      currency
    });

    let reservationId: string | undefined;
    let orderCreated = false;
    let streamCancelled = false;
    let streamSettled = false;

    const pause = async () => {
      if (intervalMs > 0) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, intervalMs);
          timer.unref?.();
        });
      }
    };

    const emit = async (step: string, status: string, detail: string) => {
      if (streamCancelled) {
        return;
      }
      const event = workflowStore.appendEvent(run.runId, {
        step,
        status,
        detail,
        correlationId
      });
      call.write(workflowEventResponse(run, event));
      await pause();
    };

    const cancelWorkflow = async (detail: string) => {
      if (streamCancelled || streamSettled) {
        return;
      }

      streamCancelled = true;
      if (!orderCreated && reservationId) {
        try {
          store.release(reservationId);
        } catch {
          // Ignore compensation failures in the practice SUT.
        }
      }

      workflowStore.setFinalStatus(run.runId, "cancelled");
      const event = workflowStore.appendEvent(run.runId, {
        step: "cancelled",
        status: "cancelled",
        detail,
        correlationId
      });

      try {
        if (!call.cancelled) {
          call.write(workflowEventResponse(run, event));
        }
      } catch {
        // The client may have already disconnected.
      }

      try {
        call.end();
      } catch {
        // Ignore end errors after cancellation/disconnect.
      }
    };

    call.on?.("cancelled", () => {
      void cancelWorkflow("client cancelled workflow stream");
    });

    try {
      await emit("accepted", "started", "workflow accepted");
      if (autoCancelAfterStep === "accepted" || streamCancelled) {
        await cancelWorkflow("workflow auto-cancelled after step accepted");
        return;
      }

      const reservation = store.reserve(sku, quantity, `wf-res-${orderId}`);
      reservationId = reservation.reservationId;
      await emit("inventory_reserved", "succeeded", `reserved ${reservation.quantity} units`);
      if (autoCancelAfterStep === "inventory_reserved" || streamCancelled) {
        await cancelWorkflow("workflow auto-cancelled after step inventory_reserved");
        return;
      }

      if (failureStep === "pricing") {
        throw new Error("Injected workflow failure at pricing");
      }

      const quote = await pricingStore.getQuote({
        sku,
        quantity,
        currency,
        shiftBasisPoints: priceShiftBasisPoints,
        delayMs: 0
      });
      await emit("priced", "succeeded", quote.pricingRule);
      if (autoCancelAfterStep === "priced" || streamCancelled) {
        await cancelWorkflow("workflow auto-cancelled after step priced");
        return;
      }

      if (failureStep === "persist") {
        throw new Error("Injected workflow failure at persist");
      }

      orderStore.create({
        orderId,
        reservationId: reservation.reservationId,
        sku: reservation.sku,
        quantity: reservation.quantity,
        currency: quote.currency,
        unitPriceCents: quote.unitPriceCents,
        totalPriceCents: quote.totalPriceCents,
        pricingRule: quote.pricingRule,
        status: "created"
      });
      orderCreated = true;
      await emit("order_created", "succeeded", orderId);
      if (autoCancelAfterStep === "order_created" || streamCancelled) {
        await cancelWorkflow("workflow auto-cancelled after step order_created");
        return;
      }

      if (failureStep === "audit") {
        throw new Error("Injected workflow failure at audit");
      }

      auditStore.add({
        eventId: randomUUID(),
        eventType: "workflow_order_created",
        entityId: orderId,
        payload: JSON.stringify({ sku, quantity }),
        eventTimeEpochMs: Date.now()
      });
      await emit("audit_recorded", "succeeded", `audit stored for ${orderId}`);
      if (autoCancelAfterStep === "audit_recorded" || streamCancelled) {
        await cancelWorkflow("workflow auto-cancelled after step audit_recorded");
        return;
      }

      if (failureStep === "notify") {
        throw new Error("Injected workflow failure at notify");
      }

      const notification = notificationStore.publish({
        messageId: randomUUID(),
        channel: "workflow",
        body: `workflow completed for ${orderId}`,
        senderId: "workflow-service"
      });
      broadcastNotification("workflow", notificationRecordResponse(notification, correlationId));
      await emit("notification_published", "succeeded", notification.messageId);
      if (autoCancelAfterStep === "notification_published" || streamCancelled) {
        await cancelWorkflow("workflow auto-cancelled after step notification_published");
        return;
      }

      if (streamCancelled) {
        return;
      }
      workflowStore.setFinalStatus(run.runId, "completed");
      await emit("completed", "succeeded", "workflow completed");
      streamSettled = true;
      call.end();
    } catch (error) {
      if (streamCancelled) {
        return;
      }
      if (!orderCreated && reservationId) {
        try {
          store.release(reservationId);
        } catch {
          // Ignore compensation failures in the practice SUT.
        }
      }

      workflowStore.setFinalStatus(run.runId, "failed");
      await emit("failed", "failed", (error as Error).message);
      streamSettled = true;
      call.end();
    }
  },

  GetWorkflowRun(
    call: grpc.ServerUnaryCall<{ orderId?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["user", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const orderId = String(call.request?.orderId ?? "").trim();
    if (!orderId) {
      callback(orderValidationError("orderId is required", grpc.status.INVALID_ARGUMENT), null);
      return;
    }

    try {
      const run = workflowStore.getByOrderId(orderId);
      callback(null, {
        run: workflowRunResponse(run),
        correlationId: correlationIdFromMetadata(call.metadata)
      });
    } catch (error) {
      callback(orderValidationError((error as Error).message, grpc.status.NOT_FOUND), null);
    }
  },

  ListWorkflowRuns(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["user", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      runs: workflowStore.list().map(workflowRunResponse),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  },

  ResetWorkflowRuns(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      cleared: workflowStore.reset(),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  }
};

const resiliencyService = {
  async ExecuteUnstableOperation(
    call: grpc.ServerUnaryCall<
      {
        operationKey?: string;
        failUntilAttempt?: number;
        retryableCode?: string;
        processingDelayMs?: number;
      },
      unknown
    >,
    callback: grpc.sendUnaryData<unknown>
  ): Promise<void> {
    const authFailure = requireAuth(call.metadata, ["user", "service", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const operationKey = String(call.request?.operationKey ?? "").trim();
    const failUntilAttempt = Number(call.request?.failUntilAttempt ?? 0);
    const retryableCode = String(call.request?.retryableCode ?? "UNAVAILABLE").trim().toUpperCase();
    const processingDelayMs = Number(call.request?.processingDelayMs ?? 0);

    if (!operationKey) {
      callback(validationError("operationKey is required", grpc.status.INVALID_ARGUMENT), null);
      return;
    }
    if (!Number.isInteger(failUntilAttempt) || failUntilAttempt < 0 || failUntilAttempt > 20) {
      callback(validationError("failUntilAttempt must be an integer between 0 and 20", grpc.status.INVALID_ARGUMENT), null);
      return;
    }
    if (!Number.isInteger(processingDelayMs) || processingDelayMs < 0 || processingDelayMs > 5000) {
      callback(validationError("processingDelayMs must be an integer between 0 and 5000", grpc.status.INVALID_ARGUMENT), null);
      return;
    }

    if (processingDelayMs > 0) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, processingDelayMs);
        timer.unref?.();
      });
    }

    const attempt = resiliencyStore.increment(operationKey);
    if (attempt.attemptCount <= failUntilAttempt) {
      callback(
        validationError(
          `Injected ${retryableCode} for ${operationKey} on attempt ${attempt.attemptCount}`,
          resiliencyCodeToStatus(retryableCode)
        ),
        null
      );
      return;
    }

    callback(null, {
      operationKey,
      attemptNumber: attempt.attemptCount,
      outcome: "succeeded",
      retryableCode,
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  },

  GetAttemptSnapshot(
    call: grpc.ServerUnaryCall<{ operationKey?: string }, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["user", "service", "admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const operationKey = String(call.request?.operationKey ?? "").trim();
    const attempts = operationKey ? [resiliencyStore.get(operationKey)] : resiliencyStore.list();
    callback(null, {
      attempts,
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  },

  ResetAttemptCounters(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      cleared: resiliencyStore.reset(),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  }
};

const adminService = {
  GetSystemSnapshot(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    callback(null, {
      inventory: {
        skuCount: store.listStock().length,
        activeReservationCount: store.reservationCount()
      },
      orders: {
        orderCount: orderStore.list().length
      },
      audit: {
        eventCount: auditStore.list().length
      },
      notifications: {
        notificationCount: notificationStore.list().length,
        activeChannelSubscriberCount: Array.from(notificationSubscribers.values()).reduce(
          (total, subscribers) => total + subscribers.size,
          0
        )
      },
      workflows: {
        runCount: workflowStore.list().length
      },
      resiliency: {
        trackedOperationCount: resiliencyStore.list().length
      },
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  },

  ResetAllState(
    call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
    callback: grpc.sendUnaryData<unknown>
  ): void {
    const authFailure = requireAuth(call.metadata, ["admin"]);
    if (authFailure) {
      callback(authFailure, null);
      return;
    }

    const injected = maybeFail(call.metadata);
    if (injected) {
      callback(injected, null);
      return;
    }

    const clearedOrders = orderStore.reset();
    const clearedAuditEvents = auditStore.reset();
    const clearedNotifications = notificationStore.reset();
    const clearedWorkflowRuns = workflowStore.reset();
    const clearedResiliencyCounters = resiliencyStore.reset();
    store.reset();
    notificationSubscribers.clear();

    callback(null, {
      clearedOrders,
      clearedAuditEvents,
      clearedNotifications,
      clearedWorkflowRuns,
      clearedResiliencyCounters,
      remainingInventoryReservations: store.reservationCount(),
      inventory: store.listStock(),
      correlationId: correlationIdFromMetadata(call.metadata)
    });
  }
};

export const __testables = {
  inventoryService,
  pricingService,
  orderService,
  auditService,
  healthService,
  notificationService,
  adminService,
  workflowService,
  resiliencyService,
  quoteResponse,
  orderResponse,
  auditEventResponse,
  healthResponse,
  notificationRecordResponse,
  workflowEventResponse,
  workflowRunResponse
};

export type StartedGrpcServer = {
  port: number;
  shutdown: () => Promise<void>;
};

export async function startGrpcServer(port = Number(process.env.GRPC_PORT ?? 50051)): Promise<StartedGrpcServer> {
  const server = new grpc.Server();
  server.addService(inventoryPackage.InventoryService.service, inventoryService);
  server.addService(pricingPackage.PricingService.service, pricingService);
  server.addService(orderPackage.OrderService.service, orderService);
  server.addService(auditPackage.AuditService.service, auditService);
  server.addService(healthPackage.Health.service, healthService);
  server.addService(notificationPackage.NotificationService.service, notificationService);
  server.addService(adminPackage.AdminService.service, adminService);
  server.addService(workflowPackage.WorkflowService.service, workflowService);
  server.addService(resiliencyPackage.ResiliencyService.service, resiliencyService);
  new ReflectionService(packageDefinition).addToServer(server);

  const boundPort = await new Promise<number>((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, actualPort) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(actualPort);
    });
  });

  console.log(`gRPC inventory, pricing, order, audit, health, notification, admin, workflow, and resiliency server running on ${boundPort}`);

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
