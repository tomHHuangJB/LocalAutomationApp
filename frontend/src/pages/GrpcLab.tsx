import React, { useMemo, useState } from "react";
import Section from "../components/Section";

type AuthProfile = "public" | "user" | "service" | "admin";

type Scenario = {
  id: string;
  service: string;
  method: string;
  description: string;
  auth: AuthProfile;
  expected: string;
  payload: string;
};

const scenarios: Scenario[] = [
  {
    id: "inventory-read",
    service: "automation.inventory.v1.InventoryService",
    method: "GetStock",
    description: "Public unary read for inventory lookup.",
    auth: "public",
    expected: "Returns stock details without auth.",
    payload: '{"sku":"SKU-RED-CHAIR"}'
  },
  {
    id: "order-create",
    service: "automation.order.v1.OrderService",
    method: "CreateOrder",
    description: "User-authenticated order creation with reservation and pricing orchestration.",
    auth: "user",
    expected: "Returns created order. Missing auth should return UNAUTHENTICATED.",
    payload: '{"orderId":"ui-order-1","sku":"SKU-RED-CHAIR","quantity":1,"currency":"USD"}'
  },
  {
    id: "audit-list",
    service: "automation.audit.v1.AuditService",
    method: "ListAuditEvents",
    description: "Service-authenticated audit inspection.",
    auth: "service",
    expected: "Returns audit events for service/admin callers.",
    payload: '{"eventType":""}'
  },
  {
    id: "admin-snapshot",
    service: "automation.admin.v1.AdminService",
    method: "GetSystemSnapshot",
    description: "Admin-only system state snapshot across all gRPC-backed services.",
    auth: "admin",
    expected: "Returns counts for inventory, orders, audit, and notifications.",
    payload: "{}"
  },
  {
    id: "health-check",
    service: "grpc.health.v1.Health",
    method: "Check",
    description: "Reflection-friendly health validation without proto flags.",
    auth: "public",
    expected: "Returns SERVING for known services.",
    payload: '{"service":"automation.notification.v1.NotificationService"}'
  }
];

const profileHeaders: Record<Exclude<AuthProfile, "public">, Array<string>> = {
  user: ["-H 'x-api-key: test-user-key'", "-H 'x-user-role: user'"],
  service: ["-H 'x-api-key: test-service-key'", "-H 'x-user-role: service'"],
  admin: ["-H 'x-api-key: test-admin-key'", "-H 'x-user-role: admin'"]
};

function buildGrpcurlCommand(port: string, scenario: Scenario, profile: AuthProfile) {
  const base = ["grpcurl", "-plaintext"];
  const headers = profile === "public" ? [] : profileHeaders[profile];
  const payload = `-d '${scenario.payload}'`;
  const target = `localhost:${port} ${scenario.service}/${scenario.method}`;
  return [...base, ...headers, payload, target].join(" \\\n  ");
}

export default function GrpcLab() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(scenarios[0].id);
  const [selectedProfile, setSelectedProfile] = useState<AuthProfile>("public");
  const [grpcPort, setGrpcPort] = useState("50051");

  const scenario = scenarios.find((item) => item.id === selectedScenarioId) ?? scenarios[0];

  const recommendedProfile = scenario.auth;
  const command = useMemo(
    () => buildGrpcurlCommand(grpcPort, scenario, selectedProfile),
    [grpcPort, scenario, selectedProfile]
  );

  return (
    <div className="space-y-6">
      <Section title="gRPC Practice Console">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <label className="block text-sm">
              <div className="mb-1 font-medium">Scenario</div>
              <select
                className="w-full rounded border border-black/20 p-2"
                value={selectedScenarioId}
                onChange={(event) => {
                  const nextScenarioId = event.target.value;
                  const nextScenario = scenarios.find((item) => item.id === nextScenarioId) ?? scenarios[0];
                  setSelectedScenarioId(nextScenarioId);
                  setSelectedProfile(nextScenario.auth);
                }}
                data-testid="grpc-scenario-select"
              >
                {scenarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.service}/{item.method}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <div className="mb-1 font-medium">Auth profile</div>
                <select
                  className="w-full rounded border border-black/20 p-2"
                  value={selectedProfile}
                  onChange={(event) => setSelectedProfile(event.target.value as AuthProfile)}
                  data-testid="grpc-auth-select"
                >
                  <option value="public">public</option>
                  <option value="user">user</option>
                  <option value="service">service</option>
                  <option value="admin">admin</option>
                </select>
              </label>

              <label className="block text-sm">
                <div className="mb-1 font-medium">gRPC port</div>
                <input
                  className="w-full rounded border border-black/20 p-2"
                  value={grpcPort}
                  onChange={(event) => setGrpcPort(event.target.value)}
                  data-testid="grpc-port-input"
                />
              </label>
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-4" data-testid="grpc-scenario-card">
              <div className="text-xs uppercase tracking-wide text-black/50">Selected Scenario</div>
              <div className="mt-1 text-lg font-semibold" data-testid="grpc-scenario-title">
                {scenario.service}/{scenario.method}
              </div>
              <p className="mt-2 text-sm text-black/70" data-testid="grpc-scenario-description">
                {scenario.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-ember/10 px-3 py-1 text-ember" data-testid="grpc-required-auth">
                  Required auth: {recommendedProfile}
                </span>
                <span className="rounded-full bg-black/5 px-3 py-1" data-testid="grpc-selected-auth">
                  Active profile: {selectedProfile}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-black p-4 text-sm text-white" data-testid="grpc-command-panel">
            <div className="text-xs uppercase tracking-wide text-white/60">Generated grpcurl</div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6" data-testid="grpc-command">
              {command}
            </pre>
          </div>
        </div>
      </Section>

      <Section title="Expected Outcome">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-black/10 bg-white p-4" data-testid="grpc-expected-result">
            <div className="text-sm font-medium">Expected result</div>
            <p className="mt-2 text-sm text-black/70">{scenario.expected}</p>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4" data-testid="grpc-reflection-tip">
            <div className="text-sm font-medium">Reflection tip</div>
            <p className="mt-2 text-sm text-black/70">
              Reflection is enabled. You can also run <code>grpcurl -plaintext localhost:{grpcPort} list</code> or
              <code> grpcurl -plaintext localhost:{grpcPort} describe {scenario.service}</code> without any <code>-proto</code> flag.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Metadata Guide">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm" data-testid="grpc-auth-table">
            <thead>
              <tr className="border-b border-black/10 text-left">
                <th className="px-3 py-2 font-medium">Profile</th>
                <th className="px-3 py-2 font-medium">Headers</th>
                <th className="px-3 py-2 font-medium">Typical usage</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/5">
                <td className="px-3 py-2">public</td>
                <td className="px-3 py-2">none</td>
                <td className="px-3 py-2">Inventory reads, health, reflection</td>
              </tr>
              <tr className="border-b border-black/5">
                <td className="px-3 py-2">user</td>
                <td className="px-3 py-2 font-mono text-xs">x-api-key: test-user-key, x-user-role: user</td>
                <td className="px-3 py-2">orders, notifications, inventory writes</td>
              </tr>
              <tr className="border-b border-black/5">
                <td className="px-3 py-2">service</td>
                <td className="px-3 py-2 font-mono text-xs">x-api-key: test-service-key, x-user-role: service</td>
                <td className="px-3 py-2">audit ingestion and audit listing</td>
              </tr>
              <tr>
                <td className="px-3 py-2">admin</td>
                <td className="px-3 py-2 font-mono text-xs">x-api-key: test-admin-key, x-user-role: admin</td>
                <td className="px-3 py-2">resets, snapshots, privileged controls</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
