export type StoredWorkflowEvent = {
  sequenceNumber: number;
  step: string;
  status: string;
  detail: string;
  correlationId: string;
};

export type StoredWorkflowRun = {
  runId: string;
  orderId: string;
  sku: string;
  quantity: number;
  currency: string;
  finalStatus: "running" | "completed" | "failed" | "cancelled";
  events: StoredWorkflowEvent[];
};

export class WorkflowStore {
  private readonly runsById = new Map<string, StoredWorkflowRun>();
  private readonly runIdByOrderId = new Map<string, string>();

  create(run: Omit<StoredWorkflowRun, "events" | "finalStatus">): StoredWorkflowRun {
    const existingRunId = this.runIdByOrderId.get(run.orderId);
    if (existingRunId) {
      return this.getByRunId(existingRunId);
    }

    const created: StoredWorkflowRun = {
      ...run,
      finalStatus: "running",
      events: []
    };
    this.runsById.set(created.runId, created);
    this.runIdByOrderId.set(created.orderId, created.runId);
    return created;
  }

  appendEvent(runId: string, event: Omit<StoredWorkflowEvent, "sequenceNumber">): StoredWorkflowEvent {
    const run = this.getByRunId(runId);
    const stored: StoredWorkflowEvent = {
      ...event,
      sequenceNumber: run.events.length + 1
    };
    run.events.push(stored);
    return stored;
  }

  setFinalStatus(runId: string, finalStatus: StoredWorkflowRun["finalStatus"]): StoredWorkflowRun {
    const run = this.getByRunId(runId);
    run.finalStatus = finalStatus;
    return run;
  }

  getByRunId(runId: string): StoredWorkflowRun {
    const run = this.runsById.get(runId);
    if (!run) {
      throw new Error(`Unknown workflow run: ${runId}`);
    }
    return run;
  }

  getByOrderId(orderId: string): StoredWorkflowRun {
    const runId = this.runIdByOrderId.get(orderId);
    if (!runId) {
      throw new Error(`Unknown workflow order: ${orderId}`);
    }
    return this.getByRunId(runId);
  }

  list(): StoredWorkflowRun[] {
    return Array.from(this.runsById.values());
  }

  reset(): number {
    const cleared = this.runsById.size;
    this.runsById.clear();
    this.runIdByOrderId.clear();
    return cleared;
  }
}
