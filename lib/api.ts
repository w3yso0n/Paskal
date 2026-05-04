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

/** Mensaje legible desde la respuesta Nest / fetch (para toast y logs). */
export function getApiErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error.trim()
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>
    const m = o.message
    if (typeof m === "string" && m.trim()) return m.trim()
    if (Array.isArray(m) && m.length > 0) {
      const parts = m.map((x) => String(x)).filter((s) => s.trim())
      if (parts.length) return parts.join(". ")
    }
    const errStr = o.error
    if (typeof errStr === "string" && errStr.trim()) return errStr.trim()
    const code = o.statusCode
    if (code === 503) {
      return (
        (typeof m === "string" && m) ||
        "Servicio no disponible. Si creas usuarios, el backend necesita Firebase Admin configurado."
      )
    }
    if (code === 403) return "No tienes permiso para esta acción."
    if (code === 401) return "Sesión no válida o expirada."
    if (code === 400) return "Datos inválidos o email ya registrado."
    if (code === 409) return "Conflicto: el recurso ya existe."
  }
  return ""
}

function extractErrorBodyMessage(body: Record<string, unknown>, res: Response): string {
  const m = body.message
  if (typeof m === "string" && m.trim()) return m.trim()
  if (Array.isArray(m) && m.length > 0) {
    const parts = m.map((x) => String(x)).filter((s) => s.trim())
    if (parts.length) return parts.join(". ")
  }
  const err = body.error
  if (typeof err === "string" && err.trim()) return err.trim()
  return res.statusText?.trim() || `HTTP ${res.status}`
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
    const msg = String((error as { message?: unknown }).message ?? "");
    if (code === 403 && msg.toLowerCase().includes("registrada")) {
      return msg || "Tu cuenta no está registrada en la plataforma.";
    }
    if (code === 503) {
      if (msg.trim()) return msg;
      return "El servidor no puede validar el inicio de sesión. Intenta más tarde.";
    }
    if (code === 401 || code === 403 || code === 400) {
      return "Correo o contraseña incorrectos.";
    }
  }
  return "No se pudo iniciar sesión. Intenta de nuevo.";
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parseFailed = false;
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parseFailed = true;
    body = { message: text || res.statusText };
  }
  if (!res.ok) {
    const msg = extractErrorBodyMessage(body, res);
    const err: ApiError = {
      message: msg || `HTTP ${res.status}`,
      statusCode: (typeof body.statusCode === "number" ? body.statusCode : undefined) ?? res.status,
    };
    throw err;
  }
  if (parseFailed) {
    const err: ApiError = {
      message: "Respuesta del servidor no es JSON válido.",
      statusCode: res.status,
    };
    throw err;
  }
  return body as T;
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
 * Firebase: intercambia idToken por JWT de la API (access + refresh).
 */
export async function exchangeFirebaseToken(idToken: string): Promise<AuthTokens> {
  const base = apiBaseUrl || undefined;
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL no está configurada");
  }
  const res = await fetch(`${base}/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
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
  email: string;
  fullName: string;
  role: UserRole;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
  status?: string;
}

export interface UpdateUserPayload {
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

// --- Machines (piso de producción) ---

export interface ApiMachine {
  id: string;
  name: string;
  code: string | null;
  status: "running" | "idle" | "stopped" | "maintenance" | "offline";
  currentSku?: string | null;
  operatorCode?: string | null;
  operator2Code?: string | null;
  packager1Code?: string | null;
  packager2Code?: string | null;
  packager3Code?: string | null;
  packager4Code?: string | null;
  configuredAt?: string | null;
  workstationId?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function getMachines(accessToken: string): Promise<ApiMachine[]> {
  const res = await fetchWithAuth("/machine", { accessToken });
  return parseResponse<ApiMachine[]>(res);
}

export interface UpdateMachinePayload {
  status?: ApiMachine["status"]
  currentSku?: string | null
  operatorCode?: string | null
  operator2Code?: string | null
  packager1Code?: string | null
  packager2Code?: string | null
  packager3Code?: string | null
  packager4Code?: string | null
}

export async function updateMachine(
  accessToken: string,
  id: string,
  payload: UpdateMachinePayload,
): Promise<ApiMachine> {
  const res = await fetchWithAuth(`/machine/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    accessToken,
  })
  return parseResponse<ApiMachine>(res)
}

// --- Goals (metas) ---

export type ApiGoalPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly"

export interface ApiGoal {
  id: string
  orgId: string
  metricId: string
  plantId: string | null
  lineId: string | null
  machineId: string | null
  targetValue: number
  period: ApiGoalPeriod
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export async function getGoals(accessToken: string): Promise<ApiGoal[]> {
  const res = await fetchWithAuth("/goal", { accessToken })
  return parseResponse<ApiGoal[]>(res)
}

export interface CreateGoalPayload {
  metricId: string
  plantId?: string | null
  lineId?: string | null
  machineId?: string | null
  targetValue: number
  period: ApiGoalPeriod
  startDate: string | Date
  endDate: string | Date
}

export interface UpdateGoalPayload extends Partial<CreateGoalPayload> {}

export async function createGoal(accessToken: string, payload: CreateGoalPayload): Promise<ApiGoal> {
  const res = await fetchWithAuth("/goal", {
    method: "POST",
    body: JSON.stringify(payload),
    accessToken,
  })
  return parseResponse<ApiGoal>(res)
}

export async function updateGoal(
  accessToken: string,
  id: string,
  payload: UpdateGoalPayload,
): Promise<ApiGoal> {
  const res = await fetchWithAuth(`/goal/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    accessToken,
  })
  return parseResponse<ApiGoal>(res)
}

export async function deleteGoal(accessToken: string, id: string): Promise<void> {
  const res = await fetchWithAuth(`/goal/${id}`, {
    method: "DELETE",
    accessToken,
  })
  await parseResponse<void>(res)
}

// --- Metrics ---

export interface ApiMetric {
  id: string
  orgId: string
  name: string
  unit: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

export async function getMetrics(accessToken: string): Promise<ApiMetric[]> {
  const res = await fetchWithAuth("/metric", { accessToken })
  return parseResponse<ApiMetric[]>(res)
}

// --- Orgs (solo platform admin, para dropdown al crear usuario) ---

// --- Employees ---

export type ApiEmployeeStatus = "active" | "inactive" | "terminated";

export interface ApiEmployee {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: ApiEmployeeStatus;
  hiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeePayload {
  fullName: string;
  employeeCode?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  status?: ApiEmployeeStatus;
  hiredAt?: string | Date | null;
}

export interface UpdateEmployeePayload extends Partial<CreateEmployeePayload> {}

export async function getEmployees(accessToken: string): Promise<ApiEmployee[]> {
  const res = await fetchWithAuth("/employee", { accessToken });
  return parseResponse<ApiEmployee[]>(res);
}

export async function createEmployee(
  accessToken: string,
  payload: CreateEmployeePayload,
): Promise<ApiEmployee> {
  const res = await fetchWithAuth("/employee", {
    method: "POST",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<ApiEmployee>(res);
}

export async function updateEmployee(
  accessToken: string,
  id: string,
  payload: UpdateEmployeePayload,
): Promise<ApiEmployee> {
  const res = await fetchWithAuth(`/employee/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<ApiEmployee>(res);
}

export async function deleteEmployee(accessToken: string, id: string): Promise<ApiEmployee> {
  const res = await fetchWithAuth(`/employee/${id}`, {
    method: "DELETE",
    accessToken,
  });
  return parseResponse<ApiEmployee>(res);
}

// --- Alerts ---

export type ApiAlertSeverity = "low" | "medium" | "high" | "critical";
export type ApiAlertStatus = "open" | "acknowledged" | "closed";

export interface ApiAlert {
  id: string;
  ruleId: string | null;
  plantId: string | null;
  lineId: string | null;
  machineId: string | null;
  title: string;
  message: string | null;
  severity: ApiAlertSeverity;
  status: ApiAlertStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface UpdateAlertPayload {
  status?: ApiAlertStatus;
  severity?: ApiAlertSeverity;
  title?: string;
  message?: string | null;
  closedAt?: string | Date | null;
  ruleId?: string | null;
  plantId?: string | null;
  lineId?: string | null;
  machineId?: string | null;
}

export async function getAlerts(accessToken: string): Promise<ApiAlert[]> {
  const res = await fetchWithAuth("/alert", { accessToken });
  return parseResponse<ApiAlert[]>(res);
}

export async function updateAlert(
  accessToken: string,
  id: string,
  payload: UpdateAlertPayload,
): Promise<ApiAlert> {
  const res = await fetchWithAuth(`/alert/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    accessToken,
  });
  return parseResponse<ApiAlert>(res);
}

export async function deleteAlert(accessToken: string, id: string): Promise<ApiAlert> {
  const res = await fetchWithAuth(`/alert/${id}`, {
    method: "DELETE",
    accessToken,
  });
  return parseResponse<ApiAlert>(res);
}

// --- Production events (ingesta PLC / auditoría de eventos) ---

export interface ApiProductionEvent {
  id: string;
  machineId: string | null;
  runId: string | null;
  eventType: string;
  message: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}

// --- Machine check-ins (NFC) ---

export interface ApiMachineCheckin {
  id: string
  machineId: string
  machineCode: string
  operatorCode: string
  operator2Code: string | null
  packager1Code: string | null
  packager2Code: string | null
  packager3Code: string | null
  packager4Code: string | null
  isActive: boolean
  checkedInAt: string
  checkedOutAt: string | null
}

export async function getActiveMachineCheckins(accessToken: string): Promise<ApiMachineCheckin[]> {
  const res = await fetchWithAuth("/machine-checkin/active", { accessToken })
  return parseResponse<ApiMachineCheckin[]>(res)
}

export async function getMachineCheckins(
  accessToken: string,
  params: { from?: string; to?: string; limit?: number } = {},
): Promise<ApiMachineCheckin[]> {
  const q = new URLSearchParams()
  if (params.from) q.set("from", params.from)
  if (params.to) q.set("to", params.to)
  if (params.limit != null) q.set("limit", String(params.limit))
  const qs = q.toString()
  const res = await fetchWithAuth(`/machine-checkin${qs ? `?${qs}` : ""}`, { accessToken })
  return parseResponse<ApiMachineCheckin[]>(res)
}

export async function getProductionEvents(
  accessToken: string,
  params: { runId?: string; machineId?: string; limit?: number; from?: string; to?: string } = {},
): Promise<ApiProductionEvent[]> {
  const q = new URLSearchParams();
  if (params.runId) q.set("runId", params.runId);
  if (params.machineId) q.set("machineId", params.machineId);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  const qs = q.toString();
  const res = await fetchWithAuth(`/production-event${qs ? `?${qs}` : ""}`, { accessToken });
  return parseResponse<ApiProductionEvent[]>(res);
}

// --- Metric points (series de tiempo) ---

export interface ApiMetricPoint {
  id: string;
  metricId: string;
  plantId: string | null;
  lineId: string | null;
  machineId: string | null;
  value: number;
  measuredAt: string;
}

export async function getMetricPoints(
  accessToken: string,
  params: {
    metricId?: string;
    plantId?: string;
    lineId?: string;
    machineId?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {},
): Promise<ApiMetricPoint[]> {
  const q = new URLSearchParams();
  if (params.metricId) q.set("metricId", params.metricId);
  if (params.plantId) q.set("plantId", params.plantId);
  if (params.lineId) q.set("lineId", params.lineId);
  if (params.machineId) q.set("machineId", params.machineId);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  const res = await fetchWithAuth(`/metric-point${qs ? `?${qs}` : ""}`, { accessToken });
  return parseResponse<ApiMetricPoint[]>(res);
}
