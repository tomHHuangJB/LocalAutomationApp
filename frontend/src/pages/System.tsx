import React, { useEffect, useState } from "react";
import Section from "../components/Section";

export default function System() {
  const [role, setRole] = useState("viewer");
  const [storageMessage, setStorageMessage] = useState("No events yet");

  const openWindow = () => {
    window.open("/", "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const handler = () => {
      setStorageMessage(`Storage event at ${new Date().toLocaleTimeString()}`);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <div className="space-y-6">
      <Section title="Browser Permissions">
        <div className="flex flex-wrap gap-2 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" data-testid="perm-geo">
            Request Geolocation
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="perm-notif">
            Request Notifications
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="perm-clipboard">
            Request Clipboard
          </button>
        </div>
        <div className="mt-2 text-xs text-black/60">Override: {window.__PERMISSION_OVERRIDE}</div>
      </Section>

      <Section title="Native Dialogs">
        <div className="flex gap-3 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => alert("Alert dialog")} data-testid="dialog-alert">
            Alert
          </button>
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => confirm("Confirm dialog")}
            data-testid="dialog-confirm">
            Confirm
          </button>
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => prompt("Prompt dialog")}
            data-testid="dialog-prompt">
            Prompt
          </button>
        </div>
      </Section>

      <Section title="Multi-window Flow">
        <button className="rounded bg-ember px-3 py-2 text-white" onClick={openWindow} data-testid="window-open">
          Open new window
        </button>
      </Section>

      <Section title="Cross-tab Session Isolation">
        <button
          className="rounded border border-black/20 px-3 py-2"
          onClick={() => localStorage.setItem("session", String(Date.now()))}
          data-testid="storage-write"
        >
          Write to localStorage
        </button>
        <div className="mt-2 text-sm" data-testid="storage-event">{storageMessage}</div>
      </Section>

      <Section title="Role-based Access">
        <select
          className="rounded border border-black/20 p-2 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          data-testid="role-access-select"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        <div className="mt-2 text-sm">Admin-only UI: {role === "admin" ? "visible" : "hidden"}</div>
      </Section>
    </div>
  );
}
