# Especificación: `acumulado anual 2026 (1).xlsx`

Se generó un volcado completo celda-por-celda en:

- `docs/acumulado-anual-2026-celda-por-celda.json`

## Hojas detectadas

1. `Turno Matutino`
2. `Turno Vespertino`
3. `Total produccion`
4. `Top maquinistas`
5. `Desempeño de operadoras`
6. `Desempeño empacadoras`
7. `Scrap acumulado`

## Resumen por hoja

- **Turno Matutino**
  - 30,617 celdas con contenido.
  - 2 fórmulas.
  - Sin merges.
  - Encabezados de base de datos de producción (Fecha, Mes, Máquina, Operadores, Item, cajas, piezas, empacadores, etc.).

- **Turno Vespertino**
  - 20,085 celdas con contenido.
  - 15 fórmulas.
  - Sin merges.
  - Encabezados similares en inglés (`Date`, `Month`, `Machine`, `Operator 1`, etc.).

- **Total produccion**
  - 299 celdas con contenido.
  - 153 fórmulas.
  - 6 merges.
  - Consolida mensual metal/bending/roller y promedios por turno.
  - Fórmulas dominantes con `SUMIF` por mes usando `Turno Matutino`/`Turno Vespertino`.

- **Top maquinistas**
  - 1,101 celdas con contenido.
  - 631 fórmulas.
  - Sin merges.
  - Ranking y métricas de productividad (`Hooks / Day`, `Hooks / Hour`, `Hooks / Minute`), por periodos/meses.

- **Desempeño de operadoras**
  - 644 celdas con contenido.
  - 208 fórmulas.
  - Sin merges.
  - Productividad por operador y mes (incluye factores de días del mes y metas diarias).

- **Desempeño empacadoras**
  - 333 celdas con contenido.
  - 112 fórmulas.
  - Sin merges.
  - Productividad por empacadora y mes, estructura similar a operadoras con metas de empaque.

- **Scrap acumulado**
  - 33 celdas con contenido.
  - 0 fórmulas.
  - 5 merges.
  - Tabla de merma acumulada (`Month`, `Scrap`, `Kg`, `Post-sale waste loss in MXN`).

## Patrones de fórmulas clave

- Consolidación mensual:
  - `SUMIF('Turno Matutino'!...`
  - `SUMIF('Turno Vespertino'!...`
  - `COUNTIF('Turno Vespertino'!...`
- Productividad:
  - divisiones por días, horas y minutos (`.../20`, `.../8`, `.../60`, etc.).
- Desempeño:
  - proporciones contra metas (`.../3650`, `.../7300`, con factores por días del mes).

## Recomendación de implementación del generador anual

1. Cargar y normalizar datos base por turno en hojas tipo tabla (`Turno Matutino`, `Turno Vespertino`).
2. Construir hojas analíticas en este orden:
   - `Total produccion`
   - `Top maquinistas`
   - `Desempeño de operadoras`
   - `Desempeño empacadoras`
   - `Scrap acumulado`
3. Replicar fórmulas con referencias directas a columnas de turno (como en el archivo origen).
4. Mantener nombres de hojas y layout exactos para evitar romper referencias.
