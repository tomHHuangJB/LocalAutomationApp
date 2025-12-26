import React, { useEffect, useState } from "react";

const panelClass =
  "fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-black/10 bg-white shadow-xl";

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [showTestIds, setShowTestIds] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [forceErrors, setForceErrors] = useState(false);
  const [networkProfile, setNetworkProfile] = useState<"normal" | "slow3g" | "offline">("normal");
  const [mockApi, setMockApi] = useState(false);
  const [permissionOverride, setPermissionOverride] = useState<"prompt" | "granted" | "denied">("prompt");
  const [timeSkew, setTimeSkew] = useState(0);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "d") {
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-testid-visible", String(showTestIds));
  }, [showTestIds]);

  useEffect(() => {
    window.__SIMULATE_NETWORK_FAILURE = simulateOffline;
  }, [simulateOffline]);

  useEffect(() => {
    window.__NETWORK_PROFILE = networkProfile;
  }, [networkProfile]);

  useEffect(() => {
    window.__MOCK_API = mockApi;
  }, [mockApi]);

  useEffect(() => {
    window.__PERMISSION_OVERRIDE = permissionOverride;
  }, [permissionOverride]);

  useEffect(() => {
    window.__TIME_SKEW_MS = timeSkew;
  }, [timeSkew]);

  if (!open) {
    return null;
  }

  return (
    <div className={panelClass} role="dialog" aria-label="Debug panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
        <div className="font-semibold">Debug Panel</div>
        <button
          className="text-sm text-black/60 hover:text-black"
          onClick={() => setOpen(false)}
          data-testid="debug-close"
        >
          Close
        </button>
      </div>
      <div className="px-4 py-4 space-y-3 text-sm">
        <label className="flex items-center justify-between">
          <span>Show test IDs</span>
          <input
            type="checkbox"
            checked={showTestIds}
            onChange={(event) => setShowTestIds(event.target.checked)}
            data-testid="debug-testids"
          />
        </label>
        <label className="flex items-center justify-between">
          <span>Simulate offline</span>
          <input
            type="checkbox"
            checked={simulateOffline}
            onChange={(event) => setSimulateOffline(event.target.checked)}
            data-testid="debug-offline"
          />
        </label>
        <label className="flex items-center justify-between">
          <span>Network profile</span>
          <select
            className="rounded border border-black/20 px-2 py-1"
            value={networkProfile}
            onChange={(event) => setNetworkProfile(event.target.value as "normal" | "slow3g" | "offline")}
            data-testid="debug-network"
          >
            <option value="normal">Normal</option>
            <option value="slow3g">Slow 3G</option>
            <option value="offline">Offline</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          <span>Force error states</span>
          <input
            type="checkbox"
            checked={forceErrors}
            onChange={(event) => setForceErrors(event.target.checked)}
            data-testid="debug-errors"
          />
        </label>
        <label className="flex items-center justify-between">
          <span>Mock API responses</span>
          <input
            type="checkbox"
            checked={mockApi}
            onChange={(event) => setMockApi(event.target.checked)}
            data-testid="debug-mock-api"
          />
        </label>
        <label className="flex items-center justify-between">
          <span>Permission override</span>
          <select
            className="rounded border border-black/20 px-2 py-1"
            value={permissionOverride}
            onChange={(event) => setPermissionOverride(event.target.value as "prompt" | "granted" | "denied")}
            data-testid="debug-permission"
          >
            <option value="prompt">Prompt</option>
            <option value="granted">Granted</option>
            <option value="denied">Denied</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          <span>Clock skew (ms)</span>
          <input
            type="number"
            className="rounded border border-black/20 px-2 py-1 w-24"
            value={timeSkew}
            onChange={(event) => setTimeSkew(Number(event.target.value))}
            data-testid="debug-time-skew"
          />
        </label>
        <div className="rounded-lg bg-ember/10 p-3 text-xs">
          {forceErrors
            ? "Error forcing is enabled. Components should surface error states."
            : "Error forcing disabled."}
        </div>
        <div className="rounded-lg border border-black/10 p-3 text-xs" data-testid="error-log-viewer">
          <div className="font-semibold mb-1">Recent Errors</div>
          <ul className="space-y-1">
            {(window.__ERROR_LOGS ?? []).slice(0, 3).map((log, index) => (
              <li key={`${log.timestamp}-${index}`}>{log.timestamp}: {log.message}</li>
            ))}
            {(!window.__ERROR_LOGS || window.__ERROR_LOGS.length === 0) && <li>No errors logged.</li>}
          </ul>
        </div>
        <div className="rounded-lg border border-black/10 p-3 text-xs" data-testid="api-log-viewer">
          <div className="font-semibold mb-1">Recent API Responses</div>
          <ul className="space-y-1">
            {(window.__API_RESPONSES ?? []).slice(0, 3).map((resp, index) => (
              <li key={`api-${index}`}>{JSON.stringify(resp).slice(0, 120)}</li>
            ))}
            {(!window.__API_RESPONSES || window.__API_RESPONSES.length === 0) && <li>No responses logged.</li>}
          </ul>
        </div>
        <div className="rounded-lg border border-black/10 p-3 text-xs" data-testid="state-viewer">
          <div className="font-semibold mb-1">App State Snapshot</div>
          <div>Path: {window.location.pathname}</div>
          <div>Network: {window.__NETWORK_PROFILE}</div>
          <div>Permissions: {window.__PERMISSION_OVERRIDE}</div>
        </div>
      </div>
    </div>
  );
}
