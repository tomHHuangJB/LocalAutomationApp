import "@testing-library/jest-dom/vitest";

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => ({
    clearRect: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => undefined
  })
});

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(_url: string) {}
  postMessage(message: number) {
    if (this.onmessage) {
      this.onmessage({ data: { result: message * 2 } } as MessageEvent);
    }
  }
  terminate() {}
}

// @ts-expect-error test-only worker stub
global.Worker = MockWorker;

if (!global.URL.createObjectURL) {
  // @ts-expect-error test-only stub
  global.URL.createObjectURL = () => "blob:mock";
}
