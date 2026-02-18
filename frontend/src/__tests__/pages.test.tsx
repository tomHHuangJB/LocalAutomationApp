import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Auth from "../pages/Auth";
import A11y from "../pages/A11y";
import Components from "../pages/Components";
import Dynamic from "../pages/Dynamic";
import Errors from "../pages/Errors";
import Experiments from "../pages/Experiments";
import Files from "../pages/Files";
import Forms from "../pages/Forms";
import Home from "../pages/Home";
import I18n from "../pages/I18n";
import Integrations from "../pages/Integrations";
import Mobile from "../pages/Mobile";
import Performance from "../pages/Performance";
import System from "../pages/System";
import Tables from "../pages/Tables";

vi.mock("../utils/api", async () => {
  return {
    API_BASE: "http://localhost:3001",
    apiFetch: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  };
});

vi.mock("../hooks/useWebSocket", async () => {
  return {
    default: () => ({ messages: [], status: "connected" })
  };
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

  it("System renders permission buttons", () => {
    render(<System />);
    expect(screen.getByTestId("perm-geo")).toBeInTheDocument();
  });

  it("Mobile renders gesture surface", () => {
    render(<Mobile />);
    expect(screen.getByTestId("gesture-surface")).toBeInTheDocument();
  });
});
