import React, { useState } from "react";
import Section from "../components/Section";

export default function Auth() {
  const [mfaCode, setMfaCode] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <div className="space-y-6">
      <Section title="Basic Login">
        <form className="grid md:grid-cols-2 gap-4" data-testid="login-form">
          <label className="text-sm">
            Username
            <input
              className="mt-1 w-full rounded border border-black/20 p-2"
              name="username"
              placeholder="principal.engineer"
              data-testid="login-username"
            />
          </label>
          <label className="text-sm">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded border border-black/20 p-2"
              name="password"
              placeholder="••••••••"
              data-testid="login-password"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              data-testid="login-remember"
            />
            Remember me (secure cookie)
          </label>
          <button
            type="button"
            className="rounded bg-ember px-4 py-2 text-white"
            data-testid="login-submit"
          >
            Sign in
          </button>
        </form>
      </Section>

      <Section title="MFA Flow">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <input
            className="w-48 rounded border border-black/20 p-2 text-center tracking-widest"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            placeholder="123456"
            data-testid="mfa-code"
          />
          <button className="rounded bg-tide px-4 py-2 text-white" data-testid="mfa-verify">
            Verify MFA
          </button>
          <div className="text-sm text-black/60">Expired code handling required.</div>
        </div>
      </Section>

      <Section title="OAuth 2.0 Simulation">
        <div className="flex flex-wrap gap-3">
          <button className="rounded border border-black/20 px-4 py-2" data-testid="oauth-google">
            Continue with Google
          </button>
          <button className="rounded border border-black/20 px-4 py-2" data-testid="oauth-facebook">
            Continue with Facebook
          </button>
          <button className="rounded border border-black/20 px-4 py-2" data-testid="oauth-callback">
            Simulate Redirect Callback
          </button>
        </div>
      </Section>

      <Section title="Session Management">
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border border-black/10 bg-white p-4" data-testid="session-refresh">
            Token refresh rotation
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4" data-testid="session-concurrent">
            Concurrent sessions list + revoke
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4" data-testid="session-sso">
            SSO logout propagation
          </div>
        </div>
      </Section>

      <Section title="Error States">
        <ul className="grid md:grid-cols-2 gap-3 text-sm">
          <li className="rounded border border-black/10 p-3" data-testid="auth-error-429">429 rate limit</li>
          <li className="rounded border border-black/10 p-3" data-testid="auth-error-expired">Expired token</li>
          <li className="rounded border border-black/10 p-3" data-testid="auth-error-invalid">Invalid grant</li>
          <li className="rounded border border-black/10 p-3" data-testid="auth-error-csrf">CSRF failure</li>
          <li className="rounded border border-black/10 p-3" data-testid="auth-error-lockout">Account lockout</li>
          <li className="rounded border border-black/10 p-3" data-testid="auth-error-reset">Password reset edge</li>
        </ul>
      </Section>
    </div>
  );
}
