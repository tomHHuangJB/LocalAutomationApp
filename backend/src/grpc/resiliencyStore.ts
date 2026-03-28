export type AttemptRecord = {
  operationKey: string;
  attemptCount: number;
};

export class ResiliencyStore {
  private readonly attempts = new Map<string, number>();

  increment(operationKey: string): AttemptRecord {
    const nextCount = (this.attempts.get(operationKey) ?? 0) + 1;
    this.attempts.set(operationKey, nextCount);
    return {
      operationKey,
      attemptCount: nextCount
    };
  }

  get(operationKey: string): AttemptRecord {
    return {
      operationKey,
      attemptCount: this.attempts.get(operationKey) ?? 0
    };
  }

  list(): AttemptRecord[] {
    return Array.from(this.attempts.entries()).map(([operationKey, attemptCount]) => ({
      operationKey,
      attemptCount
    }));
  }

  reset(): number {
    const cleared = this.attempts.size;
    this.attempts.clear();
    return cleared;
  }
}
