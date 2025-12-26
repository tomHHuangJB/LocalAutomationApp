import React, { useEffect, useState } from "react";
import Section from "../components/Section";

export default function Errors() {
  const [leak, setLeak] = useState<number[]>([]);

  useEffect(() => {
    if (leak.length === 0) return;
    const interval = setInterval(() => {
      setLeak((prev) => [...prev, Math.random()]);
    }, 1000);
    return () => clearInterval(interval);
  }, [leak.length]);

  return (
    <div className="space-y-6">
      <Section title="Network Failure Simulation">
        <button className="rounded bg-ember px-3 py-2 text-white" data-testid="network-fail">
          Trigger network failure
        </button>
      </Section>

      <Section title="Timeout Configurations">
        <div className="flex gap-3 text-sm">
          <button className="rounded border border-black/20 px-3 py-2" data-testid="timeout-1s">1s timeout</button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="timeout-5s">5s timeout</button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="timeout-30s">30s timeout</button>
        </div>
      </Section>

      <Section title="Partial Page Loads">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="rounded border border-black/10 p-3" data-testid="partial-good">Component OK</div>
          <div className="rounded border border-black/10 p-3 text-ember" data-testid="partial-fail">Component failed</div>
        </div>
      </Section>

      <Section title="Memory Leak Simulation">
        <div className="text-sm">Leak size: {leak.length}</div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-2"
          onClick={() => setLeak([1])}
          data-testid="leak-start"
        >
          Start leak
        </button>
      </Section>

      <Section title="Security Labs">
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <button className="rounded border border-black/20 px-3 py-2" data-testid="security-injection">
            Injection lab
          </button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="security-access">
            Broken access control
          </button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="security-xss">
            XSS toggles
          </button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="security-vuln">
            Vulnerable components
          </button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="security-ssrf">
            SSRF simulator
          </button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="security-crypto">
            Crypto failure
          </button>
          <button className="rounded border border-black/20 px-3 py-2" data-testid="security-logging">
            Logging gaps
          </button>
        </div>
        <div className="mt-3 text-xs text-black/60">
          Validate CSP, HSTS, X-Frame-Options, mixed content, and open redirect behavior.
        </div>
        <div className="mt-3 rounded border border-black/10 p-3 text-xs" data-testid="audit-log">
          Audit log: login_failed · user=principal · ts=now
        </div>
        <div className="mt-2 text-xs text-black/60">
          Security headers endpoint: <code>/api/security/headers</code>
        </div>
      </Section>
    </div>
  );
}
