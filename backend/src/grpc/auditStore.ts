export type StoredAuditEvent = {
  eventId: string;
  eventType: string;
  entityId: string;
  payload: string;
  eventTimeEpochMs: number;
};

export class AuditStore {
  private events: StoredAuditEvent[] = [];

  add(event: StoredAuditEvent): StoredAuditEvent {
    this.events.push(event);
    return event;
  }

  list(eventType?: string): StoredAuditEvent[] {
    if (!eventType) {
      return [...this.events];
    }
    return this.events.filter((event) => event.eventType === eventType);
  }

  reset(): number {
    const cleared = this.events.length;
    this.events = [];
    return cleared;
  }
}
