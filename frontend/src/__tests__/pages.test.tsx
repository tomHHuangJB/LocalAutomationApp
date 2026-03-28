import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import Auth from "../pages/Auth";
import A11y from "../pages/A11y";
import Components from "../pages/Components";
import Dynamic from "../pages/Dynamic";
import Errors from "../pages/Errors";
import Experiments from "../pages/Experiments";
import Files from "../pages/Files";
import Forms from "../pages/Forms";
import GrpcLab from "../pages/GrpcLab";
import Home from "../pages/Home";
import I18n from "../pages/I18n";
import Integrations from "../pages/Integrations";
import Mobile from "../pages/Mobile";
import Performance from "../pages/Performance";
import System from "../pages/System";
import Tables from "../pages/Tables";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn()
}));

vi.mock("../utils/api", async () => {
  return {
    API_BASE: "http://localhost:3001",
    apiFetch: apiFetchMock
  };
});

vi.mock("../hooks/useWebSocket", async () => {
  return {
    default: () => ({ messages: [], status: "connected" })
  };
});

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.9);
  if (!("PointerEvent" in window)) {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent
    });
  }
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/race?label=fast")) {
      return new Response(JSON.stringify({ delay: 200 }), { status: 200 });
    }
    if (url.includes("/api/race?label=slow")) {
      return new Response(JSON.stringify({ delay: 800 }), { status: 200 });
    }
    if (url.includes("/api/dedup")) {
      const callCount = apiFetchMock.mock.calls.filter(([arg]) => String(arg).includes("/api/dedup")).length;
      return new Response(JSON.stringify({ deduped: callCount > 1 }), { status: 200 });
    }
    if (url.includes("/api/partial")) {
      return new Response("partial", { status: 206 });
    }
    if (url.includes("/api/consistency")) {
      return new Response(JSON.stringify({ visibleAfterMs: 1200 }), { status: 200 });
    }
    if (url.includes("/api/upload/chunk")) {
      const received = Number((init?.headers as Record<string, string>)?.["chunk-index"] ?? 1);
      return new Response(JSON.stringify({ received, total: 5 }), { status: 200 });
    }
    if (url.includes("/api/upload/complete")) {
      return new Response(JSON.stringify({ complete: true }), { status: 200 });
    }
    if (url.includes("/api/download/")) {
      const checksum = url.includes("checksum=bad") ? "bad-hash" : "demo-hash";
      return new Response("file", { status: 200, headers: { "X-Checksum-Sha256": checksum } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  Object.defineProperty(window, "innerWidth", { configurable: true, value: 480 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn(async () => ({ scope: "/sw.js" })),
      getRegistrations: vi.fn(async () => [{ unregister: vi.fn(async () => true) }])
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Pages render", () => {
  it("Home renders session and websocket status", () => {
    render(<Home />);
    expect(screen.getByTestId("session-state")).toBeInTheDocument();
    expect(screen.getByTestId("ws-status")).toHaveTextContent("connected");
  });

  it("Auth renders login form", () => {
    render(<Auth />);
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    expect(screen.getByTestId("login-submit")).toBeInTheDocument();
  });

  it("Forms renders shadow host", () => {
    render(<Forms />);
    expect(screen.getByTestId("shadow-host")).toBeInTheDocument();
  });

  it("Components renders virtual list and rerender lab", () => {
    render(<Components />);
    expect(screen.getByTestId("virtual-list")).toBeInTheDocument();
    expect(screen.getByTestId("rerender-list")).toBeInTheDocument();
  });

  it("Tables renders data grid", () => {
    render(<Tables />);
    expect(screen.getByTestId("data-grid")).toBeInTheDocument();
  });

  it("Dynamic renders race trigger", () => {
    render(<Dynamic />);
    expect(screen.getByTestId("race-trigger")).toBeInTheDocument();
  });

  it("Errors renders network failure", () => {
    render(<Errors />);
    expect(screen.getByTestId("network-fail")).toBeInTheDocument();
  });

  it("Performance renders large DOM section", () => {
    render(<Performance />);
    expect(screen.getByTestId("large-dom")).toBeInTheDocument();
  });

  it("A11y renders aria-live region", () => {
    render(<A11y />);
    expect(screen.getByTestId("aria-live")).toBeInTheDocument();
  });

  it("A11y updates announcements and manages modal focus", async () => {
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("10:30:00 AM");

    render(<A11y />);

    fireEvent.click(screen.getByTestId("announce-btn"));
    expect(screen.getByTestId("aria-live")).toHaveTextContent("Update at 10:30:00 AM");

    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    const modal = await screen.findByTestId("focus-modal");
    await waitFor(() => expect(modal).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("focus-modal")).not.toBeInTheDocument());
  });

  it("I18n renders locale select", () => {
    render(<I18n />);
    expect(screen.getByTestId("locale-select")).toBeInTheDocument();
  });

  it("Files renders upload advance", () => {
    render(<Files />);
    expect(screen.getByTestId("upload-advance")).toBeInTheDocument();
  });

  it("Experiments renders variant buttons", () => {
    render(<Experiments />);
    expect(screen.getByTestId("variant-a")).toBeInTheDocument();
    expect(screen.getByTestId("variant-b")).toBeInTheDocument();
  });

  it("Integrations renders payment iframe", () => {
    render(<Integrations />);
    expect(screen.getByTestId("payment-iframe")).toBeInTheDocument();
  });

  it("GrpcLab renders command generator", () => {
    render(<GrpcLab />);
    expect(screen.getByTestId("grpc-scenario-select")).toBeInTheDocument();
    expect(screen.getByTestId("grpc-command")).toHaveTextContent("grpcurl");
  });

  it("GrpcLab updates generated command when scenario and auth change", () => {
    render(<GrpcLab />);
    fireEvent.change(screen.getByTestId("grpc-scenario-select"), {
      target: { value: "admin-snapshot" }
    });
    expect(screen.getByTestId("grpc-selected-auth")).toHaveTextContent("admin");
    expect(screen.getByTestId("grpc-command")).toHaveTextContent("automation.admin.v1.AdminService/GetSystemSnapshot");
    expect(screen.getByTestId("grpc-command")).toHaveTextContent("x-api-key: test-admin-key");

    fireEvent.change(screen.getByTestId("grpc-port-input"), {
      target: { value: "51051" }
    });
    expect(screen.getByTestId("grpc-reflection-tip")).toHaveTextContent("localhost:51051");
  });

  it("System renders permission buttons", () => {
    render(<System />);
    expect(screen.getByTestId("perm-geo")).toBeInTheDocument();
  });

  it("Mobile renders gesture surface", () => {
    render(<Mobile />);
    expect(screen.getByTestId("gesture-surface")).toBeInTheDocument();
  });

  it("Dynamic executes optimistic, race, dedup, partial, consistency, and service worker flows", async () => {
    render(<Dynamic />);

    fireEvent.click(screen.getByTestId("optimistic-btn"));
    expect(screen.getByTestId("optimistic-count")).toHaveTextContent("1");
    expect(screen.getByTestId("optimistic-status")).toHaveTextContent("saving");

    await waitFor(() => expect(screen.getByTestId("optimistic-status")).toHaveTextContent("saved"));
    expect(screen.getByTestId("dynamic-log")).toHaveTextContent("confirmed");

    fireEvent.click(screen.getByTestId("race-trigger"));
    await waitFor(() => expect(screen.getByTestId("race-results")).toHaveTextContent("fast:200ms"));
    expect(screen.getByTestId("race-results")).toHaveTextContent("slow:800ms");

    fireEvent.click(screen.getByTestId("dedup-trigger"));
    await waitFor(() => expect(screen.getByTestId("dedup-status")).toHaveTextContent("fresh -> cached"));

    fireEvent.click(screen.getByTestId("partial-trigger"));
    await waitFor(() => expect(screen.getByTestId("partial-status")).toHaveTextContent("status:206"));

    fireEvent.click(screen.getByTestId("cache-toggle"));
    await waitFor(() => expect(screen.getByTestId("consistency-status")).toHaveTextContent("visibleAfter:1200ms"));

    fireEvent.click(screen.getByTestId("sw-register"));
    await waitFor(() => expect(screen.getByTestId("sw-status")).toHaveTextContent("registered"));

    fireEvent.click(screen.getByTestId("sw-unregister"));
    await waitFor(() => expect(screen.getByTestId("sw-status")).toHaveTextContent("unregistered"));
  });

  it("Mobile updates orientation, swipe result, long press, and refresh count", async () => {
    render(<Mobile />);

    expect(screen.getByTestId("orientation-value")).toHaveTextContent("portrait");

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
    fireEvent(window, new Event("resize"));
    expect(screen.getByTestId("orientation-value")).toHaveTextContent("landscape");

    const surface = screen.getByTestId("gesture-surface");
    surface.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0 }));
    await waitFor(() => expect(surface.className).toContain("ring-2"));
    surface.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, clientX: 90, clientY: 0 }));
    await waitFor(() => expect(screen.getByTestId("gesture-result")).toHaveTextContent("swipe-right"));

    fireEvent.contextMenu(screen.getByTestId("long-press"));
    expect(screen.getByTestId("gesture-result")).toHaveTextContent("long-press");

    fireEvent.click(screen.getByTestId("refresh-trigger"));
    expect(screen.getByTestId("refresh-count")).toHaveTextContent("1");
  });

  it("Files advances upload flow to completion and tracks download checksums", async () => {
    render(<Files />);

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByTestId("upload-advance"));
      await waitFor(() => expect(screen.getByTestId("upload-status").textContent).not.toBe("idle"));
    }

    expect(screen.getByTestId("upload-status")).toHaveTextContent("complete");
    expect(screen.getByTestId("upload-progress")).toHaveAttribute("style", expect.stringContaining("100%"));

    fireEvent.click(screen.getByTestId("download-retry"));
    await waitFor(() => expect(screen.getByTestId("download-status")).toHaveTextContent("bad-hash"));

    fireEvent.click(screen.getByTestId("download-resume"));
    await waitFor(() => expect(screen.getByTestId("download-status")).toHaveTextContent("demo-hash"));
  });
});
