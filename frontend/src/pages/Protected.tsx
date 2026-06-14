import React, { useEffect, useState } from "react";
import Section from "../components/Section";
import { apiFetch, API_BASE } from "../utils/api";

type AuthUser = {
  user: string;
  role: string;
  sessionId: string;
};

export default function Protected() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    apiFetch(`${API_BASE}/api/auth/me`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Auth check failed: ${response.status}`);
        }
        return response.json() as Promise<AuthUser>;
      })
      .then((user) => {
        if (!cancelled) {
          setAuthUser(user);
          setStatus("authenticated");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthUser(null);
          setStatus("unauthenticated");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <Section title="Protected Session Lab">
        <div className="space-y-3">
          <div data-testid="protected-status">{status}</div>
          {authUser ? (
            <div className="rounded border border-black/10 bg-white p-4">
              <h2 className="font-semibold">Authenticated Area</h2>
              <div data-testid="protected-user">{authUser.user}</div>
              <div data-testid="protected-role">{authUser.role}</div>
              <div data-testid="protected-session">{authUser.sessionId}</div>
            </div>
          ) : (
            <div role="alert" data-testid="protected-alert">
              Please sign in to view protected content.
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
