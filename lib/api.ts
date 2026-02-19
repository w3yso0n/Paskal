/**
 * URL base del API (backend Paskal). Debe coincidir con el puerto del backend.
 * Ej: http://localhost:3001
 */
const getBaseUrl = () =>
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")
    : process.env.NEXT_PUBLIC_API_URL || "";

export const apiBaseUrl = getBaseUrl();

// --- Tipos del backend (auth) ---

export type UserRole = "admin" | "manager" | "operator" | "viewer";

export interface RequestUser {
  id: string;
  orgId: string;
  email: string;
  role: UserRole;
  isPlatformAdmin: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// --- Helpers de fetch con auth ---

export interface ApiError {
  message: string;
  statusCode?: number;
}

/**
 * Mensaje seguro para mostrar al usuario (sin revelar detalles que ayuden a ataques).
 * El error real debe registrarse en consola o backend.
 */
export function getSafeLoginMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message?: unknown }).message ?? "").toLowerCase();
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed")) {
      return "No se pudo conectar. Comprueba tu conexión e intenta de nuevo.";
    }
  }
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode?: number }).statusCode;
    if (code === 401 || code === 403 || code === 400) {
      return "Correo o contraseña incorrectos.";
    }
  }
  return "No se pudo iniciar sesión. Intenta de nuevo.";
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: { message?: string; statusCode?: number } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || res.statusText };
  }
  if (!res.ok) {
    const err: ApiError = {
      message: Array.isArray(body.message) ? body.message[0] : body.message || res.statusText,
      statusCode: body.statusCode ?? res.status,
    };
    throw err;
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Login: POST /auth/login
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<AuthTokens> {
  const base = apiBaseUrl || undefined;
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL no está configurada");
  }
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  return parseResponse<AuthTokens>(res);
}

/**
 * Refresh: POST /auth/refresh
 */
export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const base = apiBaseUrl || undefined;
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL no está configurada");
  }
  const res = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  return parseResponse<AuthTokens>(res);
}

/**
 * Logout: POST /auth/logout
 */
export async function logoutApi(refreshToken: string): Promise<void> {
  const base = apiBaseUrl || undefined;
  if (!base) return;
  try {
    await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Ignorar errores de red al cerrar sesión
  }
}

/**
 * Usuario actual: GET /auth/me (requiere Authorization: Bearer <accessToken>)
 */
export async function fetchMe(accessToken: string): Promise<RequestUser> {
  const base = apiBaseUrl || undefined;
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL no está configurada");
  }
  const res = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseResponse<RequestUser>(res);
}

// --- Config (requiere token) ---

export interface EmailConfigResponse {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  configured: boolean;
}

export interface EmailConfigPayload {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  password?: string;
  from: string;
}

async function fetchWithAuth(
  path: string,
  options: RequestInit & { accessToken: string }
): Promise<Response> {
  const base = apiBaseUrl || "";
  const { accessToken, ...init } = options;
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
}

export async function getEmailConfig(
  accessToken: string
): Promise<EmailConfigResponse> {
  const res = await fetchWithAuth("/config/email", { accessToken });
  return parseResponse<EmailConfigResponse>(res);
}

export async function setEmailConfig(
  accessToken: string,
  payload: EmailConfigPayload
): Promise<EmailConfigResponse> {
  const res = await fetchWithAuth("/config/email", {
    method: "PUT",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<EmailConfigResponse>(res);
}

// --- Alert rules (requiere token; crear/editar/eliminar solo admin org) ---

export type AlertRuleSeverity = "low" | "medium" | "high" | "critical";

export interface AlertRule {
  id: string;
  orgId: string;
  name: string;
  metricId: string | null;
  plantId: string | null;
  lineId: string | null;
  machineId: string | null;
  condition: string;
  threshold: number | null;
  severity: AlertRuleSeverity;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertRulePayload {
  name: string;
  condition: string;
  threshold?: number | null;
  severity?: AlertRuleSeverity;
  isActive?: boolean;
  metricId?: string | null;
  plantId?: string | null;
  lineId?: string | null;
  machineId?: string | null;
}

export interface UpdateAlertRulePayload extends Partial<CreateAlertRulePayload> {}

export async function getAlertRules(accessToken: string): Promise<AlertRule[]> {
  const res = await fetchWithAuth("/alert-rules", { accessToken });
  return parseResponse<AlertRule[]>(res);
}

export async function createAlertRule(
  accessToken: string,
  payload: CreateAlertRulePayload
): Promise<AlertRule> {
  const res = await fetchWithAuth("/alert-rules", {
    method: "POST",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<AlertRule>(res);
}

export async function updateAlertRule(
  accessToken: string,
  id: string,
  payload: UpdateAlertRulePayload
): Promise<AlertRule> {
  const res = await fetchWithAuth(`/alert-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<AlertRule>(res);
}

export async function deleteAlertRule(
  accessToken: string,
  id: string
): Promise<void> {
  const res = await fetchWithAuth(`/alert-rules/${id}`, {
    method: "DELETE",
    accessToken,
  });
  await parseResponse<void>(res);
}

// --- Users (requiere token; org = automática para org admin, elegible solo platform admin) ---

export interface ApiUser {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  orgId?: string;
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
  status?: string;
}

export interface UpdateUserPayload {
  orgId?: string;
  email?: string;
  password?: string;
  fullName?: string;
  role?: UserRole;
  status?: string;
}

export async function getUsers(accessToken: string): Promise<ApiUser[]> {
  const res = await fetchWithAuth("/users", { accessToken });
  return parseResponse<ApiUser[]>(res);
}

export async function createUser(
  accessToken: string,
  payload: CreateUserPayload
): Promise<ApiUser> {
  const res = await fetchWithAuth("/users", {
    method: "POST",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<ApiUser>(res);
}

export async function updateUser(
  accessToken: string,
  id: string,
  payload: UpdateUserPayload
): Promise<ApiUser> {
  const res = await fetchWithAuth(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<ApiUser>(res);
}

export async function deleteUser(
  accessToken: string,
  id: string
): Promise<void> {
  const res = await fetchWithAuth(`/users/${id}`, {
    method: "DELETE",
    accessToken,
  });
  await parseResponse<void>(res);
}

// --- Orgs (solo platform admin, para dropdown al crear usuario) ---

export interface ApiOrg {
  id: string;
  name: string;
  code: string | null;
  createdAt: string;
}

export async function getOrgs(accessToken: string): Promise<ApiOrg[]> {
  const res = await fetchWithAuth("/orgs", { accessToken });
  return parseResponse<ApiOrg[]>(res);
}
