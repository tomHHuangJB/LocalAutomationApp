export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  if (window.__SIMULATE_NETWORK_FAILURE) {
    throw new Error("Simulated network failure");
  }
  if (window.__NETWORK_PROFILE === "offline") {
    throw new Error("Network offline");
  }
  if (window.__NETWORK_PROFILE === "slow3g") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (window.__MOCK_API) {
    const mock = JSON.stringify({ mocked: true, url: typeof input === "string" ? input : input.toString() });
    window.__API_RESPONSES?.push({
      url: typeof input === "string" ? input : input.toString(),
      status: 200,
      body: mock
    });
    return new Response(mock, { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const start = performance.now();
  const response = await fetch(input, init);
  const clone = response.clone();
  const bodyText = await clone.text();
  window.__API_RESPONSES?.push({
    url: typeof input === "string" ? input : input.toString(),
    status: response.status,
    body: bodyText
  });
  const duration = Math.round(performance.now() - start);
  console.log(`[api] ${response.status} ${typeof input === "string" ? input : input.toString()} (${duration}ms)`);
  return response;
}
