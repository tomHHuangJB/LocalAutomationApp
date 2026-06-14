import React, { useState } from "react";
import Section from "../components/Section";
import { apiFetch, API_BASE } from "../utils/api";

export default function Auth() {
  const [username, setUsername] = useState("principal.engineer");
  const [password, setPassword] = useState("demo");
  const [mfaCode, setMfaCode] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [authStatus, setAuthStatus] = useState("idle");

  const login = async () => {
    setAuthStatus("signing-in");
    const response = await apiFetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, rememberMe })
    });

    const body = await response.json();
    if (!response.ok) {
      setAuthStatus(`error:${body.error?.code ?? response.status}`);
      return;
    }

    localStorage.setItem("authToken", body.token);
    localStorage.setItem("refreshToken", body.refreshToken);
    localStorage.setItem("authUser", body.user);
    localStorage.setItem("authRole", body.role);
    setAuthStatus(`token:${body.token};user:${body.user};role:${body.role}`);
  };

  const verifyMfa = async () => {
    setAuthStatus("verifying-mfa");
    const response = await apiFetch(`${API_BASE}/api/auth/refresh`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setAuthStatus(`refresh-error:${body.error?.code ?? response.status}`);
      return;
    }
    localStorage.setItem("authToken", body.token);
    localStorage.setItem("refreshToken", body.refreshToken);
    setAuthStatus(`refresh:${body.refreshToken}`);
  };

  const checkSession = async () => {
    const response = await apiFetch(`${API_BASE}/api/auth/me`);
    const body = await response.json();
    if (!response.ok) {
      setAuthStatus(`me-error:${body.error?.code ?? response.status}`);
      return;
    }
    setAuthStatus(`me:${body.user};role:${body.role}`);
  };

  const logout = async () => {
    await apiFetch(`${API_BASE}/api/auth/logout`, { method: "POST" });
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("authUser");
    localStorage.removeItem("authRole");
    setAuthStatus("logged-out");
  };

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
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            data-playwright="login-submit"
            data-selenium="login-submit"
            onClick={login}
          >
            Sign in
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded border border-black/20 px-4 py-2"
            data-testid="session-check"
            onClick={checkSession}
          >
            Check session
          </button>
          <button
            type="button"
            className="rounded border border-black/20 px-4 py-2"
            data-testid="logout-submit"
            onClick={logout}
          >
            Logout
          </button>
        </div>
        <div className="mt-2 text-xs text-black/60" data-testid="auth-status">{authStatus}</div>
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
          <button
            className="rounded bg-tide px-4 py-2 text-white"
            onClick={verifyMfa}
            data-testid="mfa-verify"
          >
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
