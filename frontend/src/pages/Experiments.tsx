import React, { useState } from "react";
import Section from "../components/Section";

export default function Experiments() {
  const [variant, setVariant] = useState("A");
  const [role, setRole] = useState("user");

  return (
    <div className="space-y-6">
      <Section title="A/B Variants">
        <div className="flex gap-3 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => setVariant("A")} data-testid="variant-a">
            Variant A
          </button>
          <button className="rounded border border-black/20 px-3 py-1" onClick={() => setVariant("B")} data-testid="variant-b">
            Variant B
          </button>
        </div>
        <div className="mt-3 text-sm">Active variant: {variant}</div>
      </Section>

      <Section title="Feature Flag Overrides">
        <div className="text-sm">Override via query param or cookie.</div>
        <button className="mt-2 rounded bg-ember px-3 py-2 text-white" data-testid="flag-override">
          Apply override
        </button>
      </Section>

      <Section title="Role/Permission-gated Flags">
        <select
          className="rounded border border-black/20 p-2 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          data-testid="role-select"
        >
          <option value="user">User</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <div className="mt-3 text-sm">Flag enabled: {role === "admin" ? "true" : "false"}</div>
      </Section>
    </div>
  );
}
