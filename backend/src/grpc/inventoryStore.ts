export type FailureMode = "none" | "unavailable" | "resource_exhausted" | "deadline_exceeded" | "internal";

export type ReservationRecord = {
  reservationId: string;
  sku: string;
  quantity: number;
};

const DEFAULT_STOCK: Record<string, number> = {
  "SKU-RED-CHAIR": 12,
  "SKU-BLUE-DESK": 5,
  "SKU-GREEN-LAMP": 0
};

export class InventoryStore {
  private stock = new Map<string, number>();
  private reservations = new Map<string, ReservationRecord>();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stock = new Map(Object.entries(DEFAULT_STOCK));
    this.reservations.clear();
  }

  listStock(): Array<{ sku: string; available: number }> {
    return Array.from(this.stock.entries()).map(([sku, available]) => ({ sku, available }));
  }

  getStock(sku: string): { sku: string; available: number } {
    const available = this.stock.get(sku);
    if (available === undefined) {
      throw new Error(`Unknown SKU: ${sku}`);
    }
    return { sku, available };
  }

  reserve(sku: string, quantity: number, reservationId: string): ReservationRecord & { remainingStock: number } {
    if (quantity <= 0) {
      throw new Error("Quantity must be greater than zero");
    }

    const existing = this.reservations.get(reservationId);
    if (existing) {
      const remainingStock = this.stock.get(existing.sku) ?? 0;
      return { ...existing, remainingStock };
    }

    const current = this.stock.get(sku);
    if (current === undefined) {
      throw new Error(`Unknown SKU: ${sku}`);
    }
    if (current < quantity) {
      throw new Error(`Insufficient stock for ${sku}`);
    }

    const updated = current - quantity;
    this.stock.set(sku, updated);

    const reservation: ReservationRecord = {
      reservationId,
      sku,
      quantity
    };
    this.reservations.set(reservationId, reservation);
    return { ...reservation, remainingStock: updated };
  }

  release(reservationId: string): ReservationRecord & { availableAfterRelease: number } {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new Error(`Unknown reservation: ${reservationId}`);
    }

    const current = this.stock.get(reservation.sku) ?? 0;
    const updated = current + reservation.quantity;
    this.stock.set(reservation.sku, updated);
    this.reservations.delete(reservationId);

    return { ...reservation, availableAfterRelease: updated };
  }
}
