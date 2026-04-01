import React, { useEffect, useMemo, useState } from "react";
import Section from "../components/Section";
import { apiFetch, API_BASE } from "../utils/api";

type PermissionName = "geo" | "notifications" | "clipboard";
type PermissionState = "prompt" | "granted" | "denied";
type RoleName = "viewer" | "editor" | "admin";

type RoleResponse = {
  roles: RoleName[];
  permissions: Record<string, string[]>;
};

const permissionLabels: Record<PermissionName, string> = {
  geo: "Geolocation",
  notifications: "Notifications",
  clipboard: "Clipboard"
};

const permissionRequestResult: Record<PermissionName, PermissionState> = {
  geo: "granted",
  notifications: "denied",
  clipboard: "granted"
};

export default function System() {
  const [role, setRole] = useState<RoleName>("viewer");
  const [storageMessage, setStorageMessage] = useState("No events yet");
  const [permissionStatus, setPermissionStatus] = useState<Record<PermissionName, PermissionState>>({
    geo: "prompt",
    notifications: "prompt",
    clipboard: "prompt"
  });
  const [permissionMessage, setPermissionMessage] = useState("No permission requests yet");
  const [dialogResult, setDialogResult] = useState("No dialogs used yet");
  const [popupStatus, setPopupStatus] = useState("No popup opened yet");
  const [roleConfig, setRoleConfig] = useState<RoleResponse>({
    roles: ["viewer", "editor", "admin"],
    permissions: { admin: ["all"], viewer: ["read"], editor: ["read", "write"] }
  });

  const openWindow = () => {
    const child = window.open("/", "_blank", "noopener,noreferrer");
    setPopupStatus(child ? "Popup opened" : "Popup blocked");
  };

  useEffect(() => {
    const loadSystemState = async () => {
      const [permissionsResponse, rolesResponse] = await Promise.all([
        apiFetch(`${API_BASE}/api/permissions`),
        apiFetch(`${API_BASE}/api/roles`)
      ]);
      const permissions = await permissionsResponse.json();
      const roles = (await rolesResponse.json()) as RoleResponse;
      setPermissionStatus({
        geo: permissions.geo,
        notifications: permissions.notifications,
        clipboard: permissions.clipboard
      });
      setRoleConfig(roles);
    };

    loadSystemState().catch(() => null);

    const handler = (event: StorageEvent) => {
      const nextValue = event.newValue ?? localStorage.getItem("session") ?? "none";
      setStorageMessage(`Storage event sync: ${nextValue}`);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const requestPermission = (name: PermissionName) => {
    const override = window.__PERMISSION_OVERRIDE;
    const nextState = override && override !== "prompt" ? override : permissionRequestResult[name];
    setPermissionStatus((current) => ({ ...current, [name]: nextState }));
    setPermissionMessage(`${permissionLabels[name]} => ${nextState}`);
  };

  const writeStorage = () => {
    const value = `session-${Date.now()}`;
    localStorage.setItem("session", value);
    setStorageMessage(`Local write: ${value}`);
  };

  const rolePermissions = useMemo(() => roleConfig.permissions[role] ?? [], [role, roleConfig.permissions]);
  const adminVisible = role === "admin";
  const destructiveActionDisabled = role === "viewer";

  return (
    <div className="space-y-6">
      <Section title="Browser Permissions">
        <div className="flex flex-wrap gap-2 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => requestPermission("geo")} data-testid="perm-geo">
            Request Geolocation
          </button>
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => requestPermission("notifications")} data-testid="perm-notif">
            Request Notifications
          </button>
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => requestPermission("clipboard")} data-testid="perm-clipboard">
            Request Clipboard
          </button>
        </div>
        <div className="mt-2 text-xs text-black/60" data-testid="perm-override">Override: {window.__PERMISSION_OVERRIDE}</div>
        <div className="mt-2 grid gap-2 text-sm md:grid-cols-3" data-testid="perm-status-list">
          <div>Geo: {permissionStatus.geo}</div>
          <div>Notifications: {permissionStatus.notifications}</div>
          <div>Clipboard: {permissionStatus.clipboard}</div>
        </div>
        <div className="mt-2 text-sm" data-testid="perm-result">{permissionMessage}</div>
      </Section>

      <Section title="Native Dialogs">
        <div className="flex gap-3 text-sm">
          <button
            className="rounded border border-black/20 px-3 py-1"
            onClick={() => {
              alert("Alert dialog");
              setDialogResult("Alert acknowledged");
            }}
            data-testid="dialog-alert"
          >
            Alert
          </button>
          <button
            className="rounded border border-black/20 px-3 py-1"
            onClick={() => {
              const confirmed = confirm("Confirm dialog");
              setDialogResult(`Confirm => ${confirmed ? "accepted" : "dismissed"}`);
            }}
            data-testid="dialog-confirm"
          >
            Confirm
          </button>
          <button
            className="rounded border border-black/20 px-3 py-1"
            onClick={() => {
              const promptValue = prompt("Prompt dialog");
              setDialogResult(`Prompt => ${promptValue ?? "cancelled"}`);
            }}
            data-testid="dialog-prompt"
          >
            Prompt
          </button>
        </div>
        <div className="mt-2 text-sm" data-testid="dialog-result">{dialogResult}</div>
      </Section>

      <Section title="Multi-window Flow">
        <button className="rounded bg-ember px-3 py-2 text-white" onClick={openWindow} data-testid="window-open">
          Open new window
        </button>
        <div className="mt-2 text-sm" data-testid="window-status">{popupStatus}</div>
      </Section>

      <Section title="Cross-tab Session Isolation">
        <button
          className="rounded border border-black/20 px-3 py-2"
          onClick={writeStorage}
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
          {roleConfig.roles.map((roleOption) => (
            <option key={roleOption} value={roleOption}>
              {roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
            </option>
          ))}
        </select>
        <div className="mt-2 text-sm" data-testid="role-permissions">Permissions: {rolePermissions.join(", ") || "none"}</div>
        <div className="mt-2 text-sm" data-testid="role-admin-visibility">Admin-only UI: {adminVisible ? "visible" : "hidden"}</div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="role-destructive-action"
          disabled={destructiveActionDisabled}
        >
          Restricted action
        </button>
      </Section>
    </div>
  );
}
