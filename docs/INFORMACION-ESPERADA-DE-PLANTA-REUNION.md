# Información que Paskal espera recibir de planta (PLC / NFC / sistemas)

**Uso:** reunión con responsable de planta para alinear fuentes de datos, formato y responsabilidades.  
**Contexto:** La producción y la asignación de personas a máquinas **no se cargan a mano** en la plataforma; deben llegar por sistemas de planta (PLC, NFC, reloj, etc.). Este documento enumera **qué información debe proporcionar la planta** para que Paskal funcione con datos reales.

---

## 1. Resumen para la reunión

- **Producción:** la plataforma espera recibir **eventos de producción** (unidades, tipo de evento, máquina, SKU, timestamp) desde el PLC o un sistema que agregue los datos del PLC.
- **Quién está en cada máquina:** la asignación operador/empacador por máquina debe llegar desde **NFC** (o sistema que registre el pase de tarjeta en cada máquina). La plataforma **no** la capturará manualmente.
- **Asistencia (entrada/salida):** si la plataforma muestra asistencia y reportes, necesita **registros de entrada y salida** (por ejemplo desde reloj o NFC de acceso). Pueden ser eventos crudos (NFC + timestamp) o ya procesados (empleado, fecha, hora entrada, hora salida).
- **Maestros:** necesitamos alinear **identificadores** de máquinas, SKUs y empleados (NFC ID) para que lo que envíen coincida con lo que la plataforma usa.

Al final del documento hay una **checklist de acuerdos** para cerrar en la reunión.

---

## 2. Datos que esperamos recibir DEL PLC (producción)

Hoy la plataforma usa registros de producción con esta forma (cada fila = un evento en una máquina en un momento):

| Dato | Descripción | Quién lo tiene | Notas |
|------|-------------|----------------|--------|
| **machine_id** | Identificador único de la máquina (ej. "M1", "L-02", código PLC). | PLC / sistema que integra el PLC | Debe ser estable y único. Definir lista de códigos con planta. |
| **timestamp** | Fecha y hora del evento (recomendado ISO 8601, ej. "2026-02-24T14:30:00.000Z"). | PLC | Zona horaria: acordar si siempre UTC o hora planta. |
| **event** | Tipo de evento: **Producción** \| **Cambio SKU** \| **Parada**. | PLC | Si el PLC solo manda “conteo”, definir cómo se clasifica (ej. conteo = Producción; señal de paro = Parada). |
| **count** | Unidades producidas en ese evento (número entero). | PLC | En eventos de tipo "Producción" es lo principal; en Parada/Cambio SKU puede ser 0. |
| **sku** | Código del SKU/producto en ese momento (ej. "SKU-001"). | PLC o sistema superior | Necesario para reportes por producto y tablero operativo. |
| **parameter_1** / **parameter_2** (opcionales) | Parámetros de proceso (temperatura, presión, etc.) si el PLC los expone. | PLC | La plataforma los puede mostrar en reportes; no obligatorio para el MVP. |

**Preguntas para planta:**
- ¿El PLC puede enviar estos datos en tiempo real (cada evento) o solo en lotes (cada X minutos)?
- ¿Existe ya un middleware/gateway que lea el PLC y envíe a un servidor/API? ¿Qué protocolo usa (OPC UA, Modbus, MQTT, HTTP, otro)?
- ¿Cómo identifican hoy cada máquina en el PLC (nombre, número, código)? Necesitamos un listado para mapear a `machine_id` en Paskal.
- ¿El PLC distingue “Producción”, “Parada” y “Cambio SKU”? Si no, ¿qué señales sí tienen para poder derivar estos tipos?

---

## 3. Datos que esperamos recibir DE NFC (asignación persona ↔ máquina)

La pantalla **Piso de producción** y los **reportes de métricas** muestran qué operador y qué empacador(es) están en cada máquina. Esa asignación **no se edita manualmente** en Paskal; debe venir del sistema que registra el NFC en planta.

Por cada “pase de tarjeta” o asignación en una máquina/estación, necesitamos algo como:

| Dato | Descripción | Quién lo tiene | Notas |
|------|-------------|----------------|--------|
| **nfc_id** (o **employee_id**) | Identificador único de la persona (ej. código de la tarjeta NFC: "NFC-001", o ID interno de nómina). | Sistema NFC / reloj / integrador | Debe ser el mismo que usemos en el maestro de empleados en Paskal. |
| **machine_id** (o **station_id**) | Máquina o estación donde se registró el pase. | Sistema NFC (cada lector asociado a una máquina) | Mismo código que en datos de producción (PLC). |
| **timestamp** | Fecha y hora del evento. | Sistema NFC | Para saber “desde cuándo” está esa persona en esa máquina. |
| **role** (opcional pero útil) | Si es **Operador** o **Empacador** (o equivalente en sus términos). | Puede venir del maestro de empleados o del tipo de lector/ubicación | Nos permite mostrar correctamente operador vs empacador en cada máquina. |

**Escenario típico:**  
Cuando un operador pasa su tarjeta en el lector de la máquina M3, el sistema de planta envía: “NFC-003, M3, 2026-02-24T06:00:00, operador”. Paskal (o el backend) interpreta: “en M3 el operador es quien tiene NFC-003”. Si tienen dos lectores por máquina (operador + empacador), pueden enviar dos eventos o un evento con rol.

**Preguntas para planta:**
- ¿Los lectores NFC están asociados a una máquina fija (un lector por máquina o por puesto)?
- ¿Qué identificador emite el sistema cuando alguien pasa la tarjeta? (código de tarjeta, número de empleado, etc.) Necesitamos el mismo en el maestro de empleados.
- ¿Pueden enviar este flujo en tiempo real (cada vez que alguien pasa la tarjeta) a una API o cola que consumamos nosotros?

---

## 4. Datos que esperamos recibir PARA ASISTENCIA (entrada/salida)

La pantalla **Métricas** incluye asistencia (entrada, salida, horas, estado). Esos datos no se cargan a mano; deben venir del reloj, NFC de acceso o sistema de nómina.

| Dato | Descripción | Quién lo tiene | Notas |
|------|-------------|----------------|--------|
| **employee_id** o **nfc_id** | Identificador de la persona. | Reloj / NFC acceso / RRHH | Mismo criterio que en asignación a máquina. |
| **date** | Fecha del día (o del turno). | Sistema | |
| **check_in_time** | Hora de entrada (ej. "06:00" o ISO). | Reloj / NFC | |
| **check_out_time** | Hora de salida (ej. "14:30"). | Reloj / NFC | |
| **status** (opcional) | Si ya lo calculan: Asistente, Ausente, Retardo, Permiso. | Sistema de nómina / reloj | Si no, podemos derivar “Retardo” por reglas (ej. entrada después de las 06:05 = retardo). |

**Preguntas para planta:**
- ¿Tienen reloj o NFC en la entrada/salida que registre entradas y salidas por empleado y día?
- ¿Pueden exportar o enviar esos registros (por día o por período) a nuestra API o a un archivo que integremos?
- Si el “estado” (retardo, permiso, ausente) lo define nómina, ¿pueden enviarlo o solo hora entrada/salida?

---

## 5. Estado de las máquinas (activa / en espera / inactiva)

El **Dashboard (Inicio)** y el **Piso de producción** muestran estado por máquina (activa, en espera, inactiva). Hoy es mock; con datos reales puede venir del PLC o derivarse de la producción.

| Dato | Descripción | Origen posible |
|------|-------------|----------------|
| **machine_id** | Misma identificación que en producción. | Maestro / PLC |
| **status** | **active** \| **waiting** \| **inactive** (o equivalente). | PLC (señal de marcha/paro) o derivado de “último evento de producción hace X minutos”. |
| **timestamp** (opcional) | Cuándo cambió el estado. | PLC |

**Preguntas para planta:**
- ¿El PLC tiene señal de “máquina en marcha” / “parada” / “en espera”? Si sí, ¿puede enviarla junto con los eventos de producción o en un canal aparte?
- Si no, ¿estamos de acuerdo en que Paskal calcule “inactiva” cuando no haya producción en X minutos?

---

## 6. Maestros que debemos alinear (quién los mantiene)

Para que los IDs que envíen coincidan con la plataforma:

| Maestro | Contenido | Responsable de definición | Notas |
|---------|-----------|---------------------------|--------|
| **Máquinas** | machine_id, nombre legible, posición (fila/columna) en el plano del piso. | Planta (nos pasan listado) o acordado juntos | Necesario para gráficos, piso de producción y reportes. |
| **SKUs** | Código (ej. SKU-001), nombre si aplica. | Planta | Debe coincidir con el código que envía el PLC en cada evento. |
| **Empleados y NFC** | Identificador interno, nombre, **nfc_id** (código de tarjeta), rol (Operador/Empacador), turno. | Puede ser planta (nos exportan) o nosotros (ellos nos dan solo los nfc_id para vincular). | Lo crítico: el **nfc_id** que envíe el sistema NFC debe ser el mismo que tengamos en Paskal. |

**Acuerdo sugerido:**  
Planta nos entrega (o acordamos formato de):
1. Listado de máquinas (id, nombre, posición si aplica).  
2. Listado de SKUs (código que usa el PLC).  
3. Listado de empleados con **código NFC** (y rol/turno si ya lo tienen); o al menos el mapeo nfc_id → nombre/empleado para que nosotros carguemos el maestro.

---

## 7. Forma de entrega (cómo recibimos los datos)

Opciones típicas para alinear en la reunión:

| Opción | Descripción | Pros / contras |
|--------|-------------|-----------------|
| **API REST (push)** | Sistema de planta (gateway, middleware) llama a *nuestro* endpoint y envía eventos o lotes (producción, NFC, asistencia). | Tiempo real, nosotros definimos contrato. Requiere que ellos implementen el cliente. |
| **API REST (pull)** | Nosotros consultamos *su* API periódicamente (máquinas, eventos de producción, NFC, asistencia). | Ellos exponen API; nosotros nos adaptamos a su formato. |
| **Cola (MQTT, RabbitMQ, etc.)** | Planta publica mensajes; nosotros nos suscribimos. | Bueno para muchos eventos; requiere infra y protocolo común. |
| **Archivos (CSV/Excel) en carpeta o SFTP** | Exportan archivos cada X tiempo; nosotros los ingerimos. | Más simple para ellos; no es tiempo real. |
| **Base de datos compartida** | Ellos escriben en una BD que nosotros leemos. | Menos estándar; acordar esquema y permisos. |

**Preguntas para planta:**
- ¿Hoy tienen algún gateway o software que ya lea el PLC y envíe datos a un servidor o nube?
- ¿Prefieren que nosotros expongamos un endpoint (ellos nos envían) o que nosotros consumamos algo de ellos (API, archivo, cola)?
- Frecuencia: ¿eventos en tiempo real (cada evento) o lotes cada X minutos?

---

## 8. Checklist de acuerdos para la reunión

Marcar o anotar lo que cierren con el responsable de planta:

**Producción (PLC)**  
- [ ] Confirmar que pueden enviar: machine_id, timestamp, event (Producción/Parada/Cambio SKU), count, sku.  
- [ ] Definir lista de códigos de máquina (machine_id) y quién la mantiene.  
- [ ] Definir lista de códigos SKU que enviará el PLC.  
- [ ] Acordar si habrá parameter_1/parameter_2 y significado.  
- [ ] Acordar forma de envío (API nuestra, API suya, archivo, cola) y frecuencia.

**NFC (asignación a máquina)**  
- [ ] Confirmar que pueden enviar: nfc_id (o employee_id), machine_id, timestamp; y opcionalmente role.  
- [ ] Acordar formato del nfc_id (debe coincidir con maestro de empleados).  
- [ ] Acordar forma de envío y frecuencia (tiempo real vs lotes).

**Asistencia (entrada/salida)**  
- [ ] Confirmar si tienen reloj/NFC de entrada-salida y si pueden exportar o enviar registros.  
- [ ] Acordar campos: employee_id/nfc_id, date, check_in_time, check_out_time (y status si aplica).  
- [ ] Acordar forma de envío (API, archivo diario, etc.).

**Estado de máquinas**  
- [ ] Decidir si estado (activa/espera/inactiva) lo envía el PLC o lo derivamos nosotros de producción.

**Maestros**  
- [ ] Responsable del listado de máquinas (id, nombre, posición).  
- [ ] Responsable del listado de SKUs (código usado en PLC).  
- [ ] Responsable del listado de empleados y nfc_id; proceso de actualización cuando entren nuevos o cambien tarjetas.

**Próximos pasos**  
- [ ] Fecha para recibir listados de máquinas y SKUs (y empleados/NFC si aplica).  
- [ ] Responsable técnico de planta para definir interfaz (API/archivo/cola).  
- [ ] Fecha objetivo para primera prueba de integración (envío real o simulado).

---

*Documento generado a partir del análisis del proyecto Paskal (industrial-monitoring-platform). Las estructuras de datos referidas coinciden con lo usado en la aplicación (mock-data, reportes de métricas, piso de producción, alertas).*


reglas de negiocio para las metas
dias laborales del mes, - fines - dias festivos - promedio de dias laborales del año

que me pase el los nfc-id para yo dar opciones al escoger

añadir alerta de desconexion

