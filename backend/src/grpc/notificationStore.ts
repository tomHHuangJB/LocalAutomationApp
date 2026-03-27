export type StoredNotification = {
  messageId: string;
  channel: string;
  body: string;
  senderId: string;
  sequenceNumber: number;
};

export class NotificationStore {
  private readonly history = new Map<string, StoredNotification[]>();
  private readonly sequenceByChannel = new Map<string, number>();

  publish(input: Omit<StoredNotification, "sequenceNumber">): StoredNotification {
    const sequenceNumber = (this.sequenceByChannel.get(input.channel) ?? 0) + 1;
    this.sequenceByChannel.set(input.channel, sequenceNumber);

    const stored: StoredNotification = {
      ...input,
      sequenceNumber
    };

    const existing = this.history.get(input.channel) ?? [];
    existing.push(stored);
    this.history.set(input.channel, existing);
    return stored;
  }

  list(channel?: string): StoredNotification[] {
    if (channel) {
      return [...(this.history.get(channel) ?? [])];
    }

    return Array.from(this.history.values()).flatMap((items) => items);
  }

  replay(channel: string, recentCount: number): StoredNotification[] {
    const items = this.history.get(channel) ?? [];
    if (recentCount <= 0) {
      return [];
    }
    return items.slice(-recentCount);
  }

  reset(): number {
    const cleared = this.list().length;
    this.history.clear();
    this.sequenceByChannel.clear();
    return cleared;
  }
}
