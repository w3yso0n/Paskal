/**
 * URL base del API (backend Paskal). Debe coincidir con el puerto del backend.
 * Ej: http://localhost:3001
 */
import type {
  AlertThresholdsConfig,
  BusinessHolidayScope,
  ProductionIncidentType,
} from "@/lib/business-rules"

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
  /** `false` si el dispositivo no reporta hace más de 2 min (máquina apagada). */
  online?: boolean;
  /** `true` si hay una sesión de mantenimiento activa (estado/LED azul). */
  inMaintenance?: boolean;
  /** Último heartbeat del dispositivo (ISO). `null` = nunca ha reportado. */
  lastSeenAt?: string | null;
  currentSku?: string | null;
  unitsPerBox?: number;
  floorRow?: number | null;
  floorCol?: number | null;
  operatorCode?: string | null;
  operator2Code?: string | null;
  packager1Code?: string | null;
  packager2Code?: string | null;
  packager3Code?: string | null;
  packager4Code?: string | null;
  configuredAt?: string | null;
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
  unitsPerBox?: number
  floorRow?: number | null
  floorCol?: number | null
  operatorCode?: string | null
  operator2Code?: string | null
  packager1Code?: string | null
  packager2Code?: string | null
  packager3Code?: string | null
  packager4Code?: string | null
}

// --- Product SKU catalog ---

export interface ApiProductSku {
  id: string
  code: string
  hookType: string | null
  color: string | null
  length: string | null
  extra: string | null
  unitsPerBox: number
  usageCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ApiSkuComponentOption {
  id: string
  componentType: "hook_type" | "color" | "length" | "extra"
  value: string
  label: string
  sortOrder: number
}

export interface CreateProductSkuPayload {
  code?: string
  hookType: string
  color: string
  length: string
  extra?: string
  unitsPerBox: number
}

export async function getProductSkus(
  accessToken: string,
  opts?: { includeInactive?: boolean },
): Promise<ApiProductSku[]> {
  const q = opts?.includeInactive ? "?includeInactive=true" : ""
  const res = await fetchWithAuth(`/product-sku${q}`, { accessToken })
  return parseResponse<ApiProductSku[]>(res)
}

export async function getSkuComponentOptions(
  accessToken: string,
): Promise<ApiSkuComponentOption[]> {
  const res = await fetchWithAuth("/product-sku/components", { accessToken })
  return parseResponse<ApiSkuComponentOption[]>(res)
}

export async function createProductSku(
  accessToken: string,
  payload: CreateProductSkuPayload,
): Promise<ApiProductSku> {
  const res = await fetchWithAuth("/product-sku", {
    method: "POST",
    body: JSON.stringify(payload),
    accessToken,
  })
  return parseResponse<ApiProductSku>(res)
}

export async function recordProductSkuUsage(
  accessToken: string,
  code: string,
): Promise<ApiProductSku | null> {
  const res = await fetchWithAuth("/product-sku/usage", {
    method: "POST",
    body: JSON.stringify({ code }),
    accessToken,
  })
  return parseResponse<ApiProductSku | null>(res)
}

export async function addSkuComponentOption(
  accessToken: string,
  payload: {
    componentType: ApiSkuComponentOption["componentType"]
    value: string
    label?: string
    sortOrder?: number
  },
): Promise<ApiSkuComponentOption> {
  const res = await fetchWithAuth("/product-sku/components", {
    method: "POST",
    body: JSON.stringify(payload),
    accessToken,
  })
  return parseResponse<ApiSkuComponentOption>(res)
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
export type ApiGoalShift = "matutino" | "vespertino"

export interface ApiGoal {
  id: string
  metricId: string
  plantId: string | null
  lineId: string | null
  machineId: string | null
  sku?: string | null
  targetValue: number
  period: ApiGoalPeriod
  /** null / ausente: cumplimiento con todos los registros del rango (sin filtrar por hora). */
  shift?: ApiGoalShift | null
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
  sku?: string | null
  targetValue: number
  period: ApiGoalPeriod
  shift?: ApiGoalShift | null
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
  /** UID de tarjeta NFC (hex, minúsculas). El backend resuelve los taps por este campo. */
  nfcCardUid: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  primaryRole: import("@/lib/employee-production-role").EmployeeProductionRole | null;
  secondaryRole: import("@/lib/employee-production-role").EmployeeSecondaryRole | null;
  status: ApiEmployeeStatus;
  hiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeePayload {
  fullName: string;
  employeeCode?: string | null;
  nfcCardUid?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  primaryRole?: import("@/lib/employee-production-role").EmployeeProductionRole | null;
  secondaryRole?: import("@/lib/employee-production-role").EmployeeSecondaryRole | null;
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

// --- Sesiones de mantenimiento (read-only, para la sección "Datos") ---

export interface ApiMaintenanceSession {
  id: string
  machineId: string
  machineCode: string
  employeeCode: string | null
  startedAt: string
  endedAt: string | null
  excludedUnits: number
}

export async function getMaintenanceSessions(
  accessToken: string,
  params: { machineId?: string; active?: boolean; limit?: number } = {},
): Promise<ApiMaintenanceSession[]> {
  const q = new URLSearchParams()
  if (params.machineId) q.set("machineId", params.machineId)
  if (params.active) q.set("active", "true")
  if (params.limit) q.set("limit", String(params.limit))
  const qs = q.toString()
  const res = await fetchWithAuth(`/maintenance${qs ? `?${qs}` : ""}`, { accessToken })
  return parseResponse<ApiMaintenanceSession[]>(res)
}

// --- Consulta SQL de solo lectura (sección "Datos") ---

export interface DataQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  /** El servidor recortó el resultado al tope de filas. */
  truncated: boolean
  elapsedMs: number
}

/**
 * Ejecuta una consulta SQL de SOLO LECTURA (una sentencia SELECT/WITH/…).
 * El backend la corre en una transacción `READ ONLY` con timeout y tope de filas.
 */
export async function runDataQuery(
  accessToken: string,
  sql: string,
  maxRows?: number,
): Promise<DataQueryResult> {
  const res = await fetchWithAuth("/data/query", {
    accessToken,
    method: "POST",
    body: JSON.stringify(maxRows != null ? { sql, maxRows } : { sql }),
  })
  return parseResponse<DataQueryResult>(res)
}

export async function closeAllMachineCheckins(accessToken: string): Promise<{ closed: number }> {
  const res = await fetchWithAuth("/machine-checkin/close-all", {
    accessToken,
    method: "POST",
  })
  return parseResponse<{ closed: number }>(res)
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

// --- Captura de datos (solo administradores) ---

export type ApiDataCaptureCategory =
  | "winding"
  | "bending"
  | "roller"
  | "scrap"
  | "historical_monthly"

export interface ApiManualDataCapture {
  id: string
  category: ApiDataCaptureCategory
  sourceKey: string
  recordDate: string | null
  recordYear: number | null
  recordMonth: number | null
  shift: string | null
  sku: string | null
  operatorCode: string | null
  packagerCode: string | null
  productionQty: number | null
  scrapQty: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateManualDataCapturePayload {
  category: ApiDataCaptureCategory
  sourceKey: string
  recordDate?: string | null
  recordYear?: number | null
  recordMonth?: number | null
  shift?: string | null
  sku?: string | null
  operatorCode?: string | null
  packagerCode?: string | null
  productionQty?: number | null
  scrapQty?: number | null
  notes?: string | null
}

export async function getManualDataCaptures(
  accessToken: string,
  params: {
    category?: ApiDataCaptureCategory
    sourceKey?: string
    from?: string
    to?: string
    recordYear?: number
    limit?: number
  } = {},
): Promise<ApiManualDataCapture[]> {
  const q = new URLSearchParams()
  if (params.category) q.set("category", params.category)
  if (params.sourceKey) q.set("sourceKey", params.sourceKey)
  if (params.from) q.set("from", params.from)
  if (params.to) q.set("to", params.to)
  if (params.recordYear != null) q.set("recordYear", String(params.recordYear))
  if (params.limit != null) q.set("limit", String(params.limit))
  const qs = q.toString()
  const res = await fetchWithAuth(`/data-capture${qs ? `?${qs}` : ""}`, { accessToken })
  return parseResponse<ApiManualDataCapture[]>(res)
}

export async function createManualDataCapture(
  accessToken: string,
  payload: CreateManualDataCapturePayload,
): Promise<ApiManualDataCapture> {
  const res = await fetchWithAuth("/data-capture", {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiManualDataCapture>(res)
}

export async function updateManualDataCapture(
  accessToken: string,
  id: string,
  payload: Partial<CreateManualDataCapturePayload>,
): Promise<ApiManualDataCapture> {
  const res = await fetchWithAuth(`/data-capture/${id}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiManualDataCapture>(res)
}

export async function deleteManualDataCapture(
  accessToken: string,
  id: string,
): Promise<ApiManualDataCapture> {
  const res = await fetchWithAuth(`/data-capture/${id}`, {
    accessToken,
    method: "DELETE",
  })
  return parseResponse<ApiManualDataCapture>(res)
}

// --- Registro diario de empleados (vacaciones, incidencias) ---

export type ApiEmployeeDayRecordType =
  | "vacation"
  | "incident"
  | "incapacity"
  | "excused_unpaid"
  | "time_exchange"

export interface ApiEmployeeDayRecord {
  id: string
  employeeId: string
  employeeName: string
  employeeCode: string | null
  recordDate: string
  shift: string | null
  recordType: ApiEmployeeDayRecordType
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEmployeeDayRecordPayload {
  employeeId: string
  recordDate: string
  shift?: string | null
  recordType: ApiEmployeeDayRecordType
  notes?: string | null
}

export async function getEmployeeDayRecords(
  accessToken: string,
  params: {
    employeeId?: string
    from?: string
    to?: string
    limit?: number
  } = {},
): Promise<ApiEmployeeDayRecord[]> {
  const q = new URLSearchParams()
  if (params.employeeId) q.set("employeeId", params.employeeId)
  if (params.from) q.set("from", params.from)
  if (params.to) q.set("to", params.to)
  if (params.limit != null) q.set("limit", String(params.limit))
  const qs = q.toString()
  const res = await fetchWithAuth(`/employee-day-record${qs ? `?${qs}` : ""}`, { accessToken })
  return parseResponse<ApiEmployeeDayRecord[]>(res)
}

export async function createEmployeeDayRecord(
  accessToken: string,
  payload: CreateEmployeeDayRecordPayload,
): Promise<ApiEmployeeDayRecord> {
  const res = await fetchWithAuth("/employee-day-record", {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiEmployeeDayRecord>(res)
}

export async function updateEmployeeDayRecord(
  accessToken: string,
  id: string,
  payload: Partial<CreateEmployeeDayRecordPayload>,
): Promise<ApiEmployeeDayRecord> {
  const res = await fetchWithAuth(`/employee-day-record/${id}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiEmployeeDayRecord>(res)
}

export async function deleteEmployeeDayRecord(
  accessToken: string,
  id: string,
): Promise<ApiEmployeeDayRecord> {
  const res = await fetchWithAuth(`/employee-day-record/${id}`, {
    accessToken,
    method: "DELETE",
  })
  return parseResponse<ApiEmployeeDayRecord>(res)
}

// --- Cambios temporales de rol ---

export type ApiEmployeeSecondaryRole =
  import("@/lib/employee-production-role").EmployeeSecondaryRole

export interface ApiEmployeeRoleEvent {
  id: string
  employeeId: string
  employeeName: string
  employeeCode: string | null
  recordDate: string
  shift: string | null
  secondaryRole: ApiEmployeeSecondaryRole
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEmployeeRoleEventPayload {
  employeeId: string
  recordDate: string
  shift?: string | null
  secondaryRole: ApiEmployeeSecondaryRole
  notes?: string | null
}

export async function getEmployeeRoleEvents(
  accessToken: string,
  params?: { employeeId?: string; from?: string; to?: string; limit?: number },
): Promise<ApiEmployeeRoleEvent[]> {
  const q = new URLSearchParams()
  if (params?.employeeId) q.set("employeeId", params.employeeId)
  if (params?.from) q.set("from", params.from)
  if (params?.to) q.set("to", params.to)
  if (params?.limit) q.set("limit", String(params.limit))
  const suffix = q.toString() ? `?${q}` : ""
  const res = await fetchWithAuth(`/employee-role-event${suffix}`, { accessToken })
  return parseResponse<ApiEmployeeRoleEvent[]>(res)
}

export async function createEmployeeRoleEvent(
  accessToken: string,
  payload: CreateEmployeeRoleEventPayload,
): Promise<ApiEmployeeRoleEvent> {
  const res = await fetchWithAuth("/employee-role-event", {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiEmployeeRoleEvent>(res)
}

export async function deleteEmployeeRoleEvent(
  accessToken: string,
  id: string,
): Promise<ApiEmployeeRoleEvent> {
  const res = await fetchWithAuth(`/employee-role-event/${id}`, {
    accessToken,
    method: "DELETE",
  })
  return parseResponse<ApiEmployeeRoleEvent>(res)
}

// --- Configuración de producción y bonos ---

export interface ApiBonusProductionConfig {
  id: string
  name: string
  effectiveMonth: string
  config: import("@/lib/bonus-production-config").BonusProductionConfigData
  createdAt: string
  updatedAt: string
}

export interface UpsertBonusProductionConfigPayload {
  name: string
  effectiveMonth: string
  config: import("@/lib/bonus-production-config").BonusProductionConfigData
}

export async function getBonusProductionConfigs(
  accessToken: string,
): Promise<ApiBonusProductionConfig[]> {
  const res = await fetchWithAuth("/bonus-config", { accessToken })
  return parseResponse<ApiBonusProductionConfig[]>(res)
}

export async function getBonusProductionConfigForMonth(
  accessToken: string,
  month: string,
): Promise<ApiBonusProductionConfig> {
  const q = new URLSearchParams({ month: month.slice(0, 7) })
  const res = await fetchWithAuth(`/bonus-config?${q}`, { accessToken })
  return parseResponse<ApiBonusProductionConfig>(res)
}

export async function upsertBonusProductionConfig(
  accessToken: string,
  payload: UpsertBonusProductionConfigPayload,
): Promise<ApiBonusProductionConfig> {
  const res = await fetchWithAuth("/bonus-config", {
    accessToken,
    method: "PUT",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiBonusProductionConfig>(res)
}

export async function deleteBonusProductionConfig(
  accessToken: string,
  effectiveMonth: string,
): Promise<ApiBonusProductionConfig> {
  const res = await fetchWithAuth(`/bonus-config/${effectiveMonth}`, {
    accessToken,
    method: "DELETE",
  })
  return parseResponse<ApiBonusProductionConfig>(res)
}

// --- Reglas de negocio ---

export interface ApiCatalogHoliday {
  date: string
  name: string
  source: "official"
}

export interface ApiBusinessHoliday {
  id: string
  holidayDate: string
  name: string
  scope: BusinessHolidayScope
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiProductionIncident {
  id: string
  incidentDate: string
  shift: string | null
  machineId: string | null
  incidentType: ProductionIncidentType
  description: string | null
  durationMinutes: number | null
  machine?: { id: string; name: string; code: string | null } | null
  createdAt: string
  updatedAt: string
}

export async function getCatalogHolidays(
  accessToken: string,
  year: number,
): Promise<ApiCatalogHoliday[]> {
  const res = await fetchWithAuth(`/business-rules/holidays/catalog?year=${year}`, { accessToken })
  return parseResponse<ApiCatalogHoliday[]>(res)
}

export async function getCustomBusinessHolidays(
  accessToken: string,
  params?: { year?: number; from?: string; to?: string },
): Promise<ApiBusinessHoliday[]> {
  const q = new URLSearchParams()
  if (params?.year) q.set("year", String(params.year))
  if (params?.from) q.set("from", params.from)
  if (params?.to) q.set("to", params.to)
  const suffix = q.toString() ? `?${q}` : ""
  const res = await fetchWithAuth(`/business-rules/holidays/custom${suffix}`, { accessToken })
  return parseResponse<ApiBusinessHoliday[]>(res)
}

export async function getResolvedHolidaysForMonth(
  accessToken: string,
  year: number,
  month: number,
): Promise<string[]> {
  const res = await fetchWithAuth(
    `/business-rules/holidays/resolved?year=${year}&month=${month}`,
    { accessToken },
  )
  return parseResponse<string[]>(res)
}

export async function createBusinessHoliday(
  accessToken: string,
  payload: {
    holidayDate: string
    name: string
    scope?: BusinessHolidayScope
    notes?: string | null
  },
): Promise<ApiBusinessHoliday> {
  const res = await fetchWithAuth("/business-rules/holidays/custom", {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiBusinessHoliday>(res)
}

export async function deleteBusinessHoliday(
  accessToken: string,
  id: string,
): Promise<ApiBusinessHoliday> {
  const res = await fetchWithAuth(`/business-rules/holidays/custom/${id}`, {
    accessToken,
    method: "DELETE",
  })
  return parseResponse<ApiBusinessHoliday>(res)
}

export async function getProductionIncidents(
  accessToken: string,
  params?: { from?: string; to?: string; incidentType?: ProductionIncidentType; limit?: number },
): Promise<ApiProductionIncident[]> {
  const q = new URLSearchParams()
  if (params?.from) q.set("from", params.from)
  if (params?.to) q.set("to", params.to)
  if (params?.incidentType) q.set("incidentType", params.incidentType)
  if (params?.limit) q.set("limit", String(params.limit))
  const suffix = q.toString() ? `?${q}` : ""
  const res = await fetchWithAuth(`/business-rules/incidents${suffix}`, { accessToken })
  return parseResponse<ApiProductionIncident[]>(res)
}

export async function createProductionIncident(
  accessToken: string,
  payload: {
    incidentDate: string
    shift?: string | null
    machineId?: string | null
    incidentType?: ProductionIncidentType
    description?: string | null
    durationMinutes?: number | null
  },
): Promise<ApiProductionIncident> {
  const res = await fetchWithAuth("/business-rules/incidents", {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  })
  return parseResponse<ApiProductionIncident>(res)
}

export async function deleteProductionIncident(
  accessToken: string,
  id: string,
): Promise<ApiProductionIncident> {
  const res = await fetchWithAuth(`/business-rules/incidents/${id}`, {
    accessToken,
    method: "DELETE",
  })
  return parseResponse<ApiProductionIncident>(res)
}

export async function getBusinessAlertThresholds(
  accessToken: string,
): Promise<AlertThresholdsConfig> {
  const res = await fetchWithAuth("/business-rules/alert-thresholds", { accessToken })
  return parseResponse<AlertThresholdsConfig>(res)
}

export async function updateBusinessAlertThresholds(
  accessToken: string,
  payload: Partial<AlertThresholdsConfig>,
): Promise<AlertThresholdsConfig> {
  const res = await fetchWithAuth("/business-rules/alert-thresholds", {
    accessToken,
    method: "PUT",
    body: JSON.stringify(payload),
  })
  return parseResponse<AlertThresholdsConfig>(res)
}

