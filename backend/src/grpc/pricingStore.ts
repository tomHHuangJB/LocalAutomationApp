import grpc from "@grpc/grpc-js";
import { randomUUID } from "crypto";

type PricingRequest = {
  sku: string;
  quantity: number;
  currency: string;
  shiftBasisPoints: number;
  delayMs: number;
};

type StreamPricingRequest = {
  sku: string;
  quantity: number;
  currency: string;
  updatesCount: number;
  intervalMs: number;
  initialShiftBasisPoints: number;
  stepBasisPoints: number;
};

export type ComputedQuote = {
  quoteId: string;
  sku: string;
  quantity: number;
  currency: string;
  unitPriceCents: number;
  totalPriceCents: number;
  pricingRule: string;
};

const BASE_PRICES_CENTS: Record<string, number> = {
  "SKU-RED-CHAIR": 12999,
  "SKU-BLUE-DESK": 45999,
  "SKU-GREEN-LAMP": 3499
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase() || "USD";
}

function validateSku(sku: string): string {
  const normalized = sku.trim().toUpperCase();
  if (!normalized) {
    throw new Error("sku is required");
  }
  if (!(normalized in BASE_PRICES_CENTS)) {
    throw new Error(`Unknown SKU: ${normalized}`);
  }
  return normalized;
}

function validateQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }
  return quantity;
}

function validateDelay(delayMs: number): number {
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5000) {
    throw new Error("delayMs must be an integer between 0 and 5000");
  }
  return delayMs;
}

function validateShift(shiftBasisPoints: number): number {
  if (!Number.isInteger(shiftBasisPoints) || shiftBasisPoints < -5000 || shiftBasisPoints > 5000) {
    throw new Error("priceShiftBasisPoints must be an integer between -5000 and 5000");
  }
  return shiftBasisPoints;
}

function computeDiscountRule(quantity: number): { basisPoints: number; rule: string } {
  if (quantity >= 10) {
    return { basisPoints: -1200, rule: "bulk-10-discount" };
  }
  if (quantity >= 5) {
    return { basisPoints: -500, rule: "bulk-5-discount" };
  }
  return { basisPoints: 0, rule: "standard-price" };
}

function applyBasisPoints(cents: number, basisPoints: number): number {
  return Math.max(1, Math.round((cents * (10_000 + basisPoints)) / 10_000));
}

export function toMoney(currency: string, cents: number) {
  const units = Math.trunc(cents / 100);
  const nanos = (cents % 100) * 10_000_000;
  return { currency, units, nanos };
}

export function pricingValidationError(error: Error): grpc.ServiceError {
  const message = error.message;
  let code = grpc.status.INVALID_ARGUMENT;
  if (message.startsWith("Unknown SKU")) {
    code = grpc.status.NOT_FOUND;
  }

  return {
    name: "PricingValidationError",
    message,
    code
  } as grpc.ServiceError;
}

export class PricingStore {
  async getQuote(request: PricingRequest): Promise<ComputedQuote> {
    const sku = validateSku(request.sku);
    const quantity = validateQuantity(request.quantity);
    const delayMs = validateDelay(request.delayMs);
    const shiftBasisPoints = validateShift(request.shiftBasisPoints);
    const currency = normalizeCurrency(request.currency);

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const basePrice = BASE_PRICES_CENTS[sku];
    const discount = computeDiscountRule(quantity);
    const unitPriceCents = applyBasisPoints(basePrice, discount.basisPoints + shiftBasisPoints);
    const totalPriceCents = unitPriceCents * quantity;

    return {
      quoteId: randomUUID(),
      sku,
      quantity,
      currency,
      unitPriceCents,
      totalPriceCents,
      pricingRule: shiftBasisPoints === 0 ? discount.rule : `${discount.rule}+market-shift`
    };
  }

  async *streamQuotes(request: StreamPricingRequest): AsyncGenerator<ComputedQuote, void, void> {
    const sku = validateSku(request.sku);
    const quantity = validateQuantity(request.quantity);
    const currency = normalizeCurrency(request.currency);
    const updatesCount = !Number.isInteger(request.updatesCount) || request.updatesCount <= 0 ? 3 : request.updatesCount;
    const intervalMs = validateDelay(request.intervalMs);
    const initialShiftBasisPoints = validateShift(request.initialShiftBasisPoints);
    const stepBasisPoints = validateShift(request.stepBasisPoints);

    for (let index = 0; index < updatesCount; index += 1) {
      if (intervalMs > 0) {
        await sleep(intervalMs);
      }

      const quote = await this.getQuote({
        sku,
        quantity,
        currency,
        shiftBasisPoints: initialShiftBasisPoints + index * stepBasisPoints,
        delayMs: 0
      });
      yield quote;
    }
  }
}
