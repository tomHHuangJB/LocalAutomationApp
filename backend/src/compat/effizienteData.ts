export type EffizienteRole = "normal" | "admin";

export type EffizienteUser = {
  id: number;
  company: string;
  username: string;
  password: string;
  role: EffizienteRole;
  name: string;
  email: string;
  accessToken: string;
};

export type EffizienteServerRecord = {
  Id: number;
  Key: number;
  Name: string;
  Url: string;
  Active: boolean;
};

export const effizienteUsers: EffizienteUser[] = [
  {
    id: 1,
    company: "Demo",
    username: "Demo",
    password: "Demo",
    role: "normal",
    name: "Demo User",
    email: "demo.user@localautomation.test",
    accessToken: "effiziente-demo-user-token"
  },
  {
    id: 2,
    company: "Demo",
    username: "Admin",
    password: "Admin",
    role: "admin",
    name: "Admin User",
    email: "admin.user@localautomation.test",
    accessToken: "effiziente-admin-user-token"
  }
];

const initialServers: EffizienteServerRecord[] = [
  { Id: 1, Key: 1001, Name: "Demo API", Url: "https://api.demo.local", Active: true },
  { Id: 2, Key: 1002, Name: "Demo UI", Url: "https://ui.demo.local", Active: true },
  { Id: 3, Key: 1003, Name: "Demo Batch", Url: "https://batch.demo.local", Active: false }
];

const initialMail = [
  {
    id: "mail-1",
    subject: "Reset password request",
    template_variables: { user: "Admin User" },
    html_path: "fake-mail/reset-password-request"
  }
];

let servers = initialServers.map((server) => ({ ...server }));
let fakeMailMessages = initialMail.map((mail) => ({ ...mail, template_variables: { ...mail.template_variables } }));

export function getEffizienteUser(company?: string, username?: string, password?: string) {
  return effizienteUsers.find(
    (user) =>
      user.company === (company ?? user.company) &&
      user.username === (username ?? user.username) &&
      user.password === (password ?? user.password)
  );
}

export function getEffizienteUserByToken(token?: string) {
  if (!token) {
    return undefined;
  }
  return effizienteUsers.find((user) => user.accessToken === token);
}

export function getEffizienteMenu(role: EffizienteRole) {
  return role === "admin"
    ? ["Accounts Receivable", "Security", "Config"]
    : ["Accounts Receivable", "Config"];
}

export function listServers() {
  return servers.map((server) => ({ ...server }));
}

export function getServerByKey(key: string) {
  return servers.find((server) => String(server.Key) === key);
}

export function createServer(server: Omit<EffizienteServerRecord, "Id">) {
  const nextId = servers.reduce((max, item) => Math.max(max, item.Id), 0) + 1;
  const record: EffizienteServerRecord = { Id: nextId, ...server };
  servers.push(record);
  return { ...record };
}

export function updateServer(server: Partial<EffizienteServerRecord> & { Key: number }) {
  const index = servers.findIndex((item) => item.Key === server.Key || item.Id === server.Id);
  if (index === -1) {
    return undefined;
  }
  servers[index] = {
    ...servers[index],
    ...server,
    Id: servers[index].Id
  };
  return { ...servers[index] };
}

export function deleteServer(id: number) {
  const before = servers.length;
  servers = servers.filter((server) => server.Id !== id);
  return before !== servers.length;
}

export function getDashboardCollections() {
  return {
    summary: { invoices: 24, totalAmount: 182340, overdueAmount: 15320 },
    dueDateSummary: { current: 12, dueSoon: 8, overdue: 4 },
    top5AvgDays: [
      { label: "Retail", value: 8 },
      { label: "SMB", value: 6 },
      { label: "Enterprise", value: 5 },
      { label: "Partners", value: 4 },
      { label: "Services", value: 3 }
    ],
    top5Total: [
      { label: "Acme Corp", value: 42000 },
      { label: "Globex", value: 36000 },
      { label: "Wayne", value: 28000 },
      { label: "Initech", value: 19000 },
      { label: "Stark", value: 14000 }
    ],
    top5Type: [
      { label: "Current", value: 44 },
      { label: "Overdue", value: 18 },
      { label: "Disputed", value: 6 },
      { label: "Credits", value: 4 },
      { label: "Other", value: 2 }
    ],
    top10Limit1: Array.from({ length: 5 }).map((_, index) => ({ label: `L1-${index + 1}`, value: 10 - index })),
    top10Limit2: Array.from({ length: 5 }).map((_, index) => ({ label: `L2-${index + 1}`, value: 12 - index })),
    top10Limit3: Array.from({ length: 5 }).map((_, index) => ({ label: `L3-${index + 1}`, value: 14 - index })),
    top10ToExpire: Array.from({ length: 5 }).map((_, index) => ({ label: `EXP-${index + 1}`, value: 7 - index }))
  };
}

export function listFakeMailMessages() {
  return fakeMailMessages.map((message) => ({
    ...message,
    template_variables: { ...message.template_variables }
  }));
}

export function addFakeResetMail(userName: string) {
  fakeMailMessages.unshift({
    id: `mail-${Date.now()}`,
    subject: "Reset password request",
    template_variables: { user: userName },
    html_path: "fake-mail/reset-password-request"
  });
}

export function resetEffizienteData() {
  servers = initialServers.map((server) => ({ ...server }));
  fakeMailMessages = initialMail.map((mail) => ({ ...mail, template_variables: { ...mail.template_variables } }));
}
