import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  it("connects and receives messages", async () => {
    // @ts-expect-error test-only override
    global.WebSocket = MockWebSocket;
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
});
