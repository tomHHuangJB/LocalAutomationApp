import React, { useEffect, useState } from "react";
import Section from "../components/Section";

export default function Dynamic() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);

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
        <button className="mt-2 rounded border border-black/20 px-3 py-2" data-testid="race-trigger">
          Fire competing requests
        </button>
      </Section>

      <Section title="Request Deduplication">
        <div className="text-sm">Identical requests should coalesce and share a response.</div>
        <button className="mt-2 rounded border border-black/20 px-3 py-2" data-testid="dedup-trigger">
          Fire duplicate requests
        </button>
      </Section>

      <Section title="Partial Content (206)">
        <div className="text-sm">Validate handling of partial content responses.</div>
        <button className="mt-2 rounded border border-black/20 px-3 py-2" data-testid="partial-trigger">
          Fetch partial content
        </button>
      </Section>

      <Section title="Offline-first Cache">
        <div className="text-sm">Simulate stale cache invalidation and reconciliation.</div>
        <button className="mt-2 rounded border border-black/20 px-3 py-2" data-testid="cache-toggle">
          Toggle offline cache
        </button>
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
          <button className="rounded border border-black/20 px-3 py-2" data-testid="sw-register">
            Register
          </button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="sw-unregister">
            Unregister
          </button>
        </div>
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
