import React, { useEffect } from "react";
import Section from "../components/Section";
import useWebSocket from "../hooks/useWebSocket";
import { apiFetch, API_BASE } from "../utils/api";

export default function Home() {
  const { messages, status } = useWebSocket("ws://localhost:3001/ws");

  useEffect(() => {
    apiFetch(`${API_BASE}/api/data`).catch(() => null);
  }, []);

  return (
    <div className="space-y-6" role="main" aria-label="Dashboard">
      <Section title="Session Overview">
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg bg-white p-4 border border-black/5" data-testid="session-state" data-playwright="session-state">
            <div className="text-black/60">Status</div>
            <div className="text-lg font-semibold">Authenticated</div>
            <div className="text-xs text-black/50">Token expires in 12m</div>
          </div>
          <div className="rounded-lg bg-white p-4 border border-black/5" data-selenium="ws-card">
            <div className="text-black/60">WebSocket</div>
            <div className="text-lg font-semibold" data-testid="ws-status">{status}</div>
            <div className="text-xs text-black/50">Reconnect enabled</div>
          </div>
          <div className="rounded-lg bg-white p-4 border border-black/5">
            <div className="text-black/60">Profiles</div>
            <div className="text-lg font-semibold">stable</div>
            <div className="text-xs text-black/50">GLOBAL_SEED=42</div>
            <div className="text-xs text-black/50">
              Skewed time: {new Date(Date.now() + (window.__TIME_SKEW_MS ?? 0)).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Notifications">
        <ul className="space-y-2" role="log" aria-live="polite" data-testid="notification-log">
          {messages.length === 0 ? (
            <li className="text-sm text-black/50">No notifications yet.</li>
          ) : (
            messages.map((message, index) => (
              <li key={`${message.timestamp}-${index}`} className="rounded-lg bg-white p-3 border border-black/5">
                <div className="text-xs text-black/50">{message.timestamp}</div>
                <div className="font-medium">{message.type}</div>
                <div className="text-sm">{message.payload}</div>
              </li>
            ))
          )}
        </ul>
      </Section>

      <Section title="Accessibility Landmarks">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-black/10 bg-white p-4" role="navigation" aria-label="Primary">
            Primary navigation landmark
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4" role="complementary" aria-label="Dashboard info">
            Complementary content landmark
          </div>
        </div>
      </Section>
    </div>
  );
}
