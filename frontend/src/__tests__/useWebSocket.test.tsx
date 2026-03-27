import { render, screen, act, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import useWebSocket from "../hooks/useWebSocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }
  send() {}
  close() {
    this.onclose?.();
  }
}

const HookProbe = () => {
  const { status, messages } = useWebSocket("ws://localhost:3001/ws");
  return (
    <div>
      <div data-testid="ws-status">{status}</div>
      <div data-testid="ws-count">{messages.length}</div>
    </div>
  );
};

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    // @ts-expect-error test-only override
    global.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("connects and receives messages", async () => {
    render(<HookProbe />);
    const instance = MockWebSocket.instances[0];
    act(() => {
      instance.onopen?.();
    });
    expect(screen.getByTestId("ws-status")).toHaveTextContent("connected");
    act(() => {
      instance.onmessage?.({ data: JSON.stringify({ type: "notification", payload: "Hello" }) } as MessageEvent);
    });
    expect(screen.getByTestId("ws-count")).toHaveTextContent("1");
  });

  it("handles raw messages, reconnects on close, and caps message history", () => {
    render(<HookProbe />);

    const first = MockWebSocket.instances[0];
    act(() => {
      first.onopen?.();
    });
    expect(screen.getByTestId("ws-status")).toHaveTextContent("connected");

    act(() => {
      first.onmessage?.({ data: "raw-message" } as MessageEvent);
    });
    expect(screen.getByTestId("ws-count")).toHaveTextContent("1");

    act(() => {
      for (let index = 0; index < 25; index += 1) {
        first.onmessage?.({
          data: JSON.stringify({ type: "notification", payload: `msg-${index}` })
        } as MessageEvent);
      }
    });
    expect(screen.getByTestId("ws-count")).toHaveTextContent("20");

    act(() => {
      first.onclose?.();
    });
    expect(screen.getByTestId("ws-status")).toHaveTextContent("disconnected");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    const second = MockWebSocket.instances[1];
    act(() => {
      second.onopen?.();
    });
    expect(screen.getByTestId("ws-status")).toHaveTextContent("connected");
  });
});
