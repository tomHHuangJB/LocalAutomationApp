export type StoredOrder = {
  orderId: string;
  reservationId: string;
  sku: string;
  quantity: number;
  currency: string;
  unitPriceCents: number;
  totalPriceCents: number;
  pricingRule: string;
  status: "created";
};

export class OrderStore {
  private orders = new Map<string, StoredOrder>();

  reset(): number {
    const cleared = this.orders.size;
    this.orders.clear();
    return cleared;
  }

  create(order: StoredOrder): StoredOrder {
    const existing = this.orders.get(order.orderId);
    if (existing) {
      return existing;
    }
    this.orders.set(order.orderId, order);
    return order;
  }

  get(orderId: string): StoredOrder {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Unknown order: ${orderId}`);
    }
    return order;
  }

  list(): StoredOrder[] {
    return Array.from(this.orders.values());
  }
}
