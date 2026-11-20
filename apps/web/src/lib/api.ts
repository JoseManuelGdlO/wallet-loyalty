export type Role = "SUPER_ADMIN" | "BUSINESS_ADMIN" | "EMPLOYEE" | "CUSTOMER";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  businessId: string | null;
  branchId: string | null;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let accessToken: string | null = null;
let refreshInflight: Promise<{ accessToken: string; user: SessionUser } | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function refreshSession() {
  if (refreshInflight) return refreshInflight;
  refreshInflight = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as { accessToken: string; user: SessionUser };
      accessToken = data.accessToken;
      return data;
    })
    .finally(() => {
      refreshInflight = null;
    });
  return refreshInflight;
}

export async function api<T>(path: string, options: RequestInit & { retry?: boolean } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  if (response.status === 401 && !options.retry && !path.endsWith("/auth/login") && !path.endsWith("/auth/refresh")) {
    const refreshed = await refreshSession();
    if (refreshed) return api<T>(path, { ...options, retry: true });
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
    throw new ApiError(response.status, data.message || "No se pudo completar la operación", data.code);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return undefined as T;
  return response.json() as Promise<T>;
}
