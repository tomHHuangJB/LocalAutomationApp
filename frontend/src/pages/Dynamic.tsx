import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { apiFetch, API_BASE } from "../utils/api";

export default function Dynamic() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [raceResults, setRaceResults] = useState<string[]>([]);
  const [dedupStatus, setDedupStatus] = useState("idle");
  const [partialStatus, setPartialStatus] = useState("idle");
  const [consistencyStatus, setConsistencyStatus] = useState("idle");
  const [swStatus, setSwStatus] = useState("unregistered");

  const addLog = (message: string) => setLogs((prev) => [message, ...prev].slice(0, 8));

  const optimisticUpdate = () => {
    setCount((prev) => prev + 1);
    setStatus("saving");
    setTimeout(() => {
      const failed = Math.random() < 0.3;
      if (failed) {
        setCount((prev) => Math.max(0, prev - 1));
        setStatus("rollback");
        addLog("Optimistic update rolled back");
      } else {
        setStatus("saved");
        addLog("Optimistic update confirmed");
      }
    }, 800);
  };

  useEffect(() => {
    addLog("Service worker sync scheduled");
  }, []);

  const runRace = async () => {
    setRaceResults([]);
    const fast = apiFetch(`${API_BASE}/api/race?label=fast&delay=200`).then((r) => r.json());
    const slow = apiFetch(`${API_BASE}/api/race?label=slow&delay=800`).then((r) => r.json());
    fast.then((data) => setRaceResults((prev) => [...prev, `fast:${data.delay}ms`]));
    slow.then((data) => setRaceResults((prev) => [...prev, `slow:${data.delay}ms`]));
    await Promise.all([fast, slow]);
  };

  const runDedup = async () => {
    setDedupStatus("running");
    const first = await apiFetch(`${API_BASE}/api/dedup?key=demo`).then((r) => r.json());
    const second = await apiFetch(`${API_BASE}/api/dedup?key=demo`).then((r) => r.json());
    setDedupStatus(`${first.deduped ? "cached" : "fresh"} -> ${second.deduped ? "cached" : "fresh"}`);
  };

  const runPartial = async () => {
    setPartialStatus("loading");
    const response = await apiFetch(`${API_BASE}/api/partial`);
    setPartialStatus(`status:${response.status}`);
  };

  const toggleConsistency = async () => {
    const response = await apiFetch(`${API_BASE}/api/consistency`).then((r) => r.json());
    setConsistencyStatus(`visibleAfter:${response.visibleAfterMs}ms`);
  };

  const registerSw = async () => {
    if (!("serviceWorker" in navigator)) {
      setSwStatus("unsupported");
      return;
    }
    await navigator.serviceWorker.register("/sw.js");
    setSwStatus("registered");
  };

  const unregisterSw = async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    setSwStatus("unregistered");
  };

  return (
    <div className="space-y-6">
      <Section title="Optimistic Updates">
        <div className="flex items-center gap-4">
          <div className="text-2xl" data-testid="optimistic-count">{count}</div>
          <button className="rounded bg-ember px-3 py-2 text-white" onClick={optimisticUpdate} data-testid="optimistic-btn">
            Optimistic +1
          </button>
          <div className="text-sm text-black/60" data-testid="optimistic-status">{status}</div>
        </div>
      </Section>

      <Section title="Race Conditions">
        <div className="text-sm">Trigger multi-request flows with out-of-order responses.</div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-2"
          onClick={runRace}
          data-testid="race-trigger"
        >
          Fire competing requests
        </button>
        <div className="mt-2 text-sm" data-testid="race-results">
          {raceResults.length === 0 ? "No results yet" : raceResults.join(" | ")}
        </div>
      </Section>

      <Section title="Request Deduplication">
        <div className="text-sm">Identical requests should coalesce and share a response.</div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-2"
          onClick={runDedup}
          data-testid="dedup-trigger"
        >
          Fire duplicate requests
        </button>
        <div className="mt-2 text-sm" data-testid="dedup-status">{dedupStatus}</div>
      </Section>

      <Section title="Partial Content (206)">
        <div className="text-sm">Validate handling of partial content responses.</div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-2"
          onClick={runPartial}
          data-testid="partial-trigger"
        >
          Fetch partial content
        </button>
        <div className="mt-2 text-sm" data-testid="partial-status">{partialStatus}</div>
      </Section>

      <Section title="Offline-first Cache">
        <div className="text-sm">Simulate stale cache invalidation and reconciliation.</div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-2"
          onClick={toggleConsistency}
          data-testid="cache-toggle"
        >
          Toggle offline cache
        </button>
        <div className="mt-2 text-sm" data-testid="consistency-status">{consistencyStatus}</div>
      </Section>

      <Section title="WebSocket Recovery">
        <div className="text-sm">Reconnect backoff and heartbeat timeouts.</div>
        <button className="mt-2 rounded border border-black/20 px-3 py-2" data-testid="ws-disconnect">
          Simulate disconnect
        </button>
      </Section>

      <Section title="Service Worker Mock">
        <div className="text-sm">Register and unregister a mock service worker.</div>
        <div className="mt-2 flex gap-3">
          <button
            className="rounded border border-black/20 px-3 py-2"
            onClick={registerSw}
            data-testid="sw-register"
          >
            Register
          </button>
          <button
            className="rounded border border-black/20 px-3 py-2"
            onClick={unregisterSw}
            data-testid="sw-unregister"
          >
            Unregister
          </button>
        </div>
        <div className="mt-2 text-sm" data-testid="sw-status">{swStatus}</div>
      </Section>

      <Section title="Loading States">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="h-16 animate-pulse rounded bg-black/10" data-testid="skeleton-card" />
          <div className="rounded border border-black/10 p-3 text-sm text-ember" data-testid="partial-failure">
            Partial failure with fallback content
          </div>
        </div>
      </Section>

      <Section title="Activity Log">
        <ul className="space-y-2 text-sm" data-testid="dynamic-log">
          {logs.map((log, index) => (
            <li key={`${log}-${index}`} className="rounded border border-black/10 p-2">
              {log}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
