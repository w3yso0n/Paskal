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

export interface RequestUser {
  id: string;
  orgId: string;
  email: string;
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
