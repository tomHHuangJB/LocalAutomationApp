import React, { useEffect, useState } from "react";
import Section from "../components/Section";

export default function Integrations() {
  const [message, setMessage] = useState("Waiting");

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      setMessage(`Message from iframe: ${event.data}`);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div className="space-y-6">
      <Section title="Sandboxed Payment Iframe">
        <iframe
          title="payment"
          sandbox="allow-scripts"
          className="h-40 w-full rounded border border-black/20"
          srcDoc={`<html><body><button onclick="parent.postMessage('payment-approved','*')">Approve Payment</button></body></html>`}
          data-testid="payment-iframe"
        />
        <div className="mt-2 text-sm" data-testid="iframe-message">{message}</div>
      </Section>

      <Section title="CSP Restricted Content">
        <div className="text-sm">Attempt to load blocked scripts/resources to validate CSP.</div>
        <div className="mt-2 rounded border border-black/10 p-2 text-xs" data-testid="csp-note">
          CSP report-only endpoint should receive violations.
        </div>
      </Section>
    </div>
  );
}
