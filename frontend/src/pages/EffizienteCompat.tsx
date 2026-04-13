import React from "react";
import { Link, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../utils/api";

type CurrentUser = {
  Id: number;
  Name: string;
  Email: string;
  Company: string;
  Role: "normal" | "admin";
};

type ServerRecord = {
  Id: number;
  Key: number;
  Name: string;
  Url: string;
  Active: boolean;
};

const COMPAT_API_BASE = `${API_BASE}/compat/effiziente`;

function getToken() {
  return window.localStorage.getItem("token") ?? "";
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const token = getToken();
  if (!token) {
    return null;
  }
  const response = await apiFetch(`${COMPAT_API_BASE}/api/Users/Current`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function EffizienteShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const menus = user.Role === "admin"
    ? ["Accounts Receivable", "Security", "Config"]
    : ["Accounts Receivable", "Config"];

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="text-lg font-semibold">Effiziente Compatibility Lab</div>
          <div className="text-sm text-slate-500">{user.Name}</div>
        </div>
        <nav className="mx-auto max-w-6xl px-6 pb-4">
          <ul className="menu-list flex gap-6 text-sm font-medium">
            {menus.map((menu) => (
              <li key={menu} className="menu-item">
                <span className="menu-label">{menu}</span>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}

function EffizienteLogin() {
  const navigate = useNavigate();
  const [company, setCompany] = React.useState("Demo");
  const [userName, setUserName] = React.useState("Demo");
  const [password, setPassword] = React.useState("Demo");
  const [message, setMessage] = React.useState("");

  const login = async () => {
    setMessage("");
    const response = await apiFetch(`${COMPAT_API_BASE}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Company: company,
        UserName: userName,
        Password: password,
        KeepSession: true,
        Code: 0
      })
    });
    if (!response.ok) {
      setMessage("Invalid credentials");
      return;
    }
    const body = await response.json();
    window.localStorage.setItem("token", body.AccessToken);
    navigate("/compat/effiziente/accounts-receivable/dashboard");
  };

  return (
    <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-2xl font-semibold">Effiziente Login</h1>
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          Company
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          User
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            placeholder="Password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-white"
          onClick={login}
        >
          Login
        </button>
        <Link id="forgotPass" to="/compat/effiziente/forgot-password" className="block text-sm text-sky-700">
          Forgot Password
        </Link>
        {message ? <div data-test="message" className="rounded bg-amber-100 px-3 py-2 text-sm">{message}</div> : null}
      </div>
    </div>
  );
}

function useEffizienteUser() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = React.useState<CurrentUser | null>(null);

  React.useEffect(() => {
    let active = true;
    fetchCurrentUser().then((currentUser) => {
      if (!active) {
        return;
      }
      if (!currentUser) {
        navigate("/compat/effiziente", { replace: true, state: { from: location.pathname } });
        return;
      }
      setUser(currentUser);
    });
    return () => {
      active = false;
    };
  }, [location.pathname, navigate]);

  return user;
}

function DashboardPage() {
  const user = useEffizienteUser();

  if (!user) {
    return null;
  }

  return (
    <EffizienteShell user={user}>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 id="title" className="mb-6 text-2xl font-semibold">Accounts Receivable Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <app-card-pie>
              <canvas id="top5" className="h-48 w-full rounded bg-slate-100" />
            </app-card-pie>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <canvas id="top5-debt" className="h-48 w-full rounded bg-slate-100" />
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <canvas id="top5-type-delay" className="h-48 w-full rounded bg-slate-100" />
            <canvas id="top5-delay" className="h-px w-px opacity-0" />
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <canvas id="summary-expiration" className="h-48 w-full rounded bg-slate-100" />
          </div>
        </div>
      </div>
    </EffizienteShell>
  );
}

function ServersPage() {
  const user = useEffizienteUser();
  const [servers, setServers] = React.useState<ServerRecord[]>([]);
  const [filter, setFilter] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [editing, setEditing] = React.useState<ServerRecord | null>(null);
  const [form, setForm] = React.useState({ key: "", name: "", url: "", active: true });

  const loadServers = React.useCallback(async () => {
    const response = await apiFetch(`${COMPAT_API_BASE}/api/server?filter=${encodeURIComponent(filter)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const body = await response.json();
    setServers(body);
  }, [filter]);

  React.useEffect(() => {
    if (user) {
      void loadServers();
    }
  }, [loadServers, user]);

  if (!user) {
    return null;
  }

  const openAdd = () => {
    setEditing(null);
    setForm({ key: "", name: "", url: "", active: true });
  };

  const openEdit = (server: ServerRecord) => {
    setEditing(server);
    setForm({
      key: String(server.Key),
      name: server.Name,
      url: server.Url,
      active: server.Active
    });
  };

  const save = async () => {
    setMessage("");
    const payload = {
      Id: editing?.Id,
      Key: Number(form.key),
      Name: form.name,
      Url: form.url,
      Active: form.active
    };
    const response = await apiFetch(`${COMPAT_API_BASE}/api/server`, {
      method: editing ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      setMessage("Saved successfully");
      setEditing(null);
      await loadServers();
    }
  };

  const download = (kind: "xlsx" | "pdf") => {
    window.location.href = `${COMPAT_API_BASE}/api/export/servers.${kind}`;
  };

  return (
    <EffizienteShell user={user}>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Servers</h1>
          <div className="flex gap-2">
            <button type="button" className="rounded bg-slate-900 px-4 py-2 text-white" onClick={openAdd}>Add</button>
            <button type="button" className="rounded border border-slate-300 px-4 py-2" onClick={() => download("xlsx")}>Excel</button>
            <button type="button" className="rounded border border-slate-300 px-4 py-2" onClick={() => download("pdf")}>PDF</button>
          </div>
        </div>
        <input
          placeholder="Filter results..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2">Key</th>
              <th className="py-2">Name</th>
              <th className="py-2">URL</th>
              <th className="py-2">Active</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.Id} className="border-b border-slate-100">
                <td className="py-2">{server.Key}</td>
                <td className="py-2">{server.Name}</td>
                <td className="py-2">{server.Url}</td>
                <td className="py-2">{String(server.Active)}</td>
                <td className="py-2">
                  <button type="button" aria-label="Edit" className="rounded border border-slate-300 px-3 py-1" onClick={() => openEdit(server)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3">
          <label className="text-sm">
            Key
            <input name="key" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={form.key} onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))} />
          </label>
          <label className="text-sm">
            Name
            <input name="name" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          </label>
          <label className="text-sm">
            Url
            <input name="url" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={form.url} onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))} />
          </label>
          <div className="flex items-center gap-2 text-sm">
            <input id="active-flag" type="checkbox" checked={form.active} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))} />
            <label htmlFor="active-flag">Active</label>
          </div>
          <div className="flex gap-3">
            <button type="button" className="rounded bg-slate-900 px-4 py-2 text-white" onClick={save}>Save</button>
            <button type="button" className="rounded border border-slate-300 px-4 py-2" onClick={openAdd}>Cancel</button>
          </div>
        </div>
        {message ? <div data-test="message" className="rounded bg-emerald-100 px-3 py-2 text-sm">{message}</div> : null}
      </div>
    </EffizienteShell>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");

  const requestReset = async () => {
    const response = await apiFetch(`${COMPAT_API_BASE}/api/auth/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (response.ok) {
      setMessage("Reset link sent");
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-2xl font-semibold">Forgot Password</h1>
      <label className="block text-sm font-medium">
        Email
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <button type="button" className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white" onClick={requestReset}>
        Send Reset Link
      </button>
      {message ? <div data-test="message" className="mt-4 rounded bg-emerald-100 px-3 py-2 text-sm">{message}</div> : null}
    </div>
  );
}

function ResetPasswordPage() {
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">Reset Password</h1>
      <p className="mt-3 text-sm text-slate-600">Compatibility placeholder for reset password flow.</p>
    </div>
  );
}

export default function EffizienteCompat() {
  return (
    <Routes>
      <Route index element={<EffizienteLogin />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="accounts-receivable/dashboard" element={<DashboardPage />} />
      <Route path="security/servers" element={<ServersPage />} />
    </Routes>
  );
}
