# Inventario de Módulos y Pantallas – Paskal

*Documento de trabajo para el Alcance Funcional. Generado a partir del análisis del repositorio.*

---

## 1. Flujo de datos desde el PLC

**La información de producción se recibe del PLC/ESP** mediante el endpoint de ingesta:

| Endpoint | Descripción |
|----------|-------------|
| `POST /production-event/ingest` | Recibe eventos enviados por la ESP/PLC en batch |

**Payload por evento (IngestPlcEventDto):**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `MACHINE_ID` | string | Código de máquina PA-05: `M-###` (tres dígitos, ej. `M-001`). Debe coincidir con `Machine.code` en la org. |
| `TIMESTAMP` | string | Fecha/hora ISO 8601 del evento |
| `OPERATOR` | string? | Código del operador (NFC ID o employee_code) |
| `PACKAGER_1` | string? | Código del empacador 1 |
| `PACKAGER_2` | string? | Código del empacador 2 |
| `COUNT` | number? | Unidades producidas en el evento |
| `EVENT` | string | Tipo: `Producción` \| `Cambio SKU` \| `Parada` (o equivalentes del PLC) |
| `SKU` | string? | Código del producto (ej. "SKU-001") |

**Body del request:** `{ events: IngestPlcEventDto[] }`

El frontend **no** envía datos al PLC; consume los eventos ya almacenados en el backend vía `GET /production-event` y otros endpoints.

---

## 2. Módulos detectados

| # | Módulo | Pantallas (rutas) | Origen datos |
|---|--------|-------------------|--------------|
| 1 | Autenticación | `/login` | API backend |
| 2 | Inicio (Dashboard) | `/` | **PLC → API** (`/production-event`, `/machine`) |
| 3 | Piso de producción | `/piso-produccion` | **PLC + API** (máquinas y asignaciones desde `/machine`, `/employee`) |
| 4 | Tablero operativo | `/tablero-operativo` | **PLC → API** (`/production-event` agrupado por operador) |
| 5 | Métricas | `/metricas` | **PLC → API** (`/production-event` para producción, operadores, SKUs) |
| 6 | Metas | `/metas` | Mock / pendiente |
| 7 | Alertas | `/alertas` | **PLC + API** (`/alert`, `/production-event`, `/machine`) |
| 8 | Administración – Usuarios | `/administracion/usuarios` | API backend |
| 9 | Administración – Config. organización | `/administracion/configuracion-organizacion` | Solo UI (no persistido) |
| 10 | Administración – Empleados | `/empleados` | API backend (`/employee`) |
| 11 | Configuración plataforma | `/configuracion` | API backend |

---

## 3. Endpoints API utilizados (frontend)

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/auth/login` | Inicio de sesión |
| POST | `/auth/refresh` | Renovación de tokens |
| POST | `/auth/logout` | Cierre de sesión |
| GET | `/auth/me` | Usuario actual (perfil/rol) |
| GET | `/config/email` | Obtener configuración SMTP |
| PUT | `/config/email` | Guardar configuración SMTP |
| GET | `/alert-rules` | Listar reglas de alerta |
| POST | `/alert-rules` | Crear regla de alerta |
| PATCH | `/alert-rules/:id` | Actualizar regla |
| DELETE | `/alert-rules/:id` | Eliminar regla |
| GET | `/users` | Listar usuarios |
| POST | `/users` | Crear usuario |
| PATCH | `/users/:id` | Actualizar usuario |
| DELETE | `/users/:id` | Eliminar usuario |
| GET | `/orgs` | Listar organizaciones (solo platform admin) |
| GET | `/machine` | Listar máquinas (piso de producción, alertas) |
| GET | `/employee` | Listar empleados (piso, gestión) |
| POST | `/employee` | Crear empleado |
| PATCH | `/employee/:id` | Actualizar empleado |
| DELETE | `/employee/:id` | Eliminar empleado |
| GET | `/alert` | Listar alertas |
| PATCH | `/alert/:id` | Actualizar alerta (marcar leída, cerrar) |
| DELETE | `/alert/:id` | Eliminar alerta |
| GET | `/production-event` | Eventos de producción (origen PLC) |
| GET | `/metric-point` | Series de métricas (opcional) |

**Ingesta PLC (fuera del frontend, lo usa la ESP/PLC):**

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/production-event/ingest` | Ingesta de eventos enviados por el PLC |

**Base URL:** definida por variable de entorno `NEXT_PUBLIC_API_URL` (backend externo al repositorio).

---

## 4. Pantallas principales por ruta

| Ruta | Nombre en UI | Descripción breve | Fuente de datos |
|------|----------------|-------------------|-----------------|
| `/login` | Iniciar sesión | Formulario email/contraseña, redirección a `/` si OK | API |
| `/` | Inicio | Dashboard con KPIs y gráfico de producción por máquinas | PLC → API |
| `/piso-produccion` | Piso de producción | Mapa de máquinas, estados, asignación operador/empacador | PLC + API |
| `/tablero-operativo` | Tablero Operativo en Vivo | Ranking de operadores, podio top 3, pantalla completa | PLC → API |
| `/metricas` | Métricas | Producción, eventos, asistencia, reportes Excel | PLC → API |
| `/metas` | Metas | Listado y gestión de metas de producción (períodos y estados) | Pendiente |
| `/alertas` | Centro de Alertas | Reglas de alerta, monitoreo producción, listado y filtros | PLC + API |
| `/administracion/usuarios` | Gestión de usuarios | Listado, alta y baja de usuarios | API |
| `/administracion/configuracion-organizacion` | Config. organización | Colores, logo, contraseñas (UI; no persistido) | Solo UI |
| `/empleados` | Gestión de empleados | Listado, alta y baja de empleados | API |
| `/configuracion` | Configuración de plataforma | SMTP y lista de organizaciones | API |

---

## 5. Roles y permisos (RBAC)

- **Roles:** `admin`, `manager`, `operator`, `viewer`.
- **Flag especial:** `isPlatformAdmin` (acceso total).
- Permisos granulares definidos en `lib/permissions.ts`; rutas protegidas en `ROUTE_PERMISSIONS` y componentes `RequirePermission` / `AuthGuard`.

---

## 6. Evidencia en repositorio

- **App y rutas:** `app/**/page.tsx`, `app/login/page.tsx`, etc.
- **API cliente:** `lib/api.ts`
- **Permisos:** `lib/permissions.ts`
- **Auth:** `contexts/auth-context.tsx`, `components/auth/auth-guard.tsx`, `components/auth/require-permission.tsx`
- **Navegación:** `components/dashboard/sidebar.tsx`
- **Tipos UI:** `lib/types.ts`
- **Datos mock (legacy):** `lib/mock-data.ts` — arreglos vacíos; la mayoría de pantallas ya consumen API/PLC.
- **Exportación Excel:** `lib/export-to-excel.ts`; uso en `components/attendance/attendance-table.tsx` y en `app/metricas/page.tsx` (reporte producción).
- **DTO ingesta PLC:** `paskal-backend/src/production-run/dto/ingest-plc-event.dto.ts`
