import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import DebugPanel from "../components/DebugPanel";
import ErrorBoundary from "../components/ErrorBoundary";

vi.mock("../hooks/useWebSocket", async () => {
  return {
    default: () => ({ messages: [], status: "connected" })
  };
});

describe("App shell", () => {
  it("renders navigation and routes", () => {
    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    expect(screen.getByTestId("nav-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("session-state")).toBeInTheDocument();
  });
});

describe("DebugPanel", () => {
  it("toggles open with keyboard shortcut and sets test id visibility", () => {
    render(<DebugPanel />);
    fireEvent.keyDown(window, { altKey: true, shiftKey: true, key: "D" });
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs.length).toBeGreaterThan(0);
    const toggle = screen.getAllByTestId("debug-testids")[0];
    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-testid-visible")).toBe("true");
  });
});

describe("ErrorBoundary", () => {
  it("catches render errors", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error("boom");
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("error-boundary")).toHaveTextContent("boom");
    consoleErrorSpy.mockRestore();
  });
});
