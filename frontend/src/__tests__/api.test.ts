import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiFetch } from "../utils/api";

beforeEach(() => {
  // reset globals used by apiFetch
  window.__SIMULATE_NETWORK_FAILURE = false;
  window.__NETWORK_PROFILE = "normal";
  window.__MOCK_API = false;
  window.__API_RESPONSES = [];
});

describe("apiFetch", () => {
  it("throws when network failure is simulated", async () => {
    window.__SIMULATE_NETWORK_FAILURE = true;
    await expect(apiFetch("http://example.com")).rejects.toThrow("Simulated network failure");
  });

  it("returns mocked response when mock API is enabled", async () => {
    window.__MOCK_API = true;
    const res = await apiFetch("http://example.com/api/test");
    const data = await res.json();
    expect(data.mocked).toBe(true);
    expect(window.__API_RESPONSES?.length).toBe(1);
  });

  it("uses fetch when mock is disabled", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    // @ts-expect-error test override
    global.fetch = fetchMock;
    const res = await apiFetch("http://example.com/api/test");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });
});
