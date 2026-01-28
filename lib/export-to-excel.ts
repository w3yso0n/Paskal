import * as XLSX from "xlsx"

export interface ExportData {
  fileName: string
  sheetName?: string
  data: any[]
  columns?: string[]
}

export function exportToExcel(options: ExportData) {
  const {
    fileName,
    sheetName = "Datos",
    data,
    columns,
  } = options

  // Crear un nuevo workbook
  const workbook = XLSX.utils.book_new()

  // Convertir datos a worksheet
  const worksheet = XLSX.utils.json_to_sheet(data)

  // Si se especifican columnas personalizadas, ajustar el ancho
  if (columns) {
    const maxWidths: number[] = []
    columns.forEach((col, index) => {
      maxWidths[index] = col.length + 2
    })
    
    // Aplicar ancho de columnas
    worksheet["!cols"] = maxWidths.map(width => ({ wch: width }))
  }

  // Agregar el worksheet al workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  // Descargar el archivo
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

export function exportAttendanceToExcel(
  records: any[],
  fileName: string = "asistencia"
) {
  const formattedData = records.map(record => ({
    "Empleado": record.employeeName,
    "Fecha": new Date(record.date).toLocaleDateString("es-ES"),
    "Entrada": record.checkInTime || "-",
    "Salida": record.checkOutTime || "-",
    "Horas": record.hoursWorked ? `${record.hoursWorked}h` : "-",
    "Estado": record.status,
    "Notas": record.notes || "-",
  }))

  exportToExcel({
    fileName,
    sheetName: "Asistencia",
    data: formattedData,
    columns: ["Empleado", "Fecha", "Entrada", "Salida", "Horas", "Estado", "Notas"],
  })
}
