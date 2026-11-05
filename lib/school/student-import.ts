import Papa from 'papaparse'

export const MAX_IMPORT_ROWS = 500
export const MAX_IMPORT_BYTES = 256 * 1024
export type ImportStudent = { row: number; dni: string; first_names: string; last_names: string }
export type ImportIssue = { row?: number; message: string }
export type ParsedStudents = { students: ImportStudent[]; issues: ImportIssue[] }

export function parseStudentsCsv(text: string): ParsedStudents {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy', dynamicTyping: false, preview: MAX_IMPORT_ROWS + 2,
    delimitersToGuess: [',', ';', '\t'],
  })
  const issues: ImportIssue[] = result.errors.map(e => ({ row: e.row === undefined ? undefined : e.row + 1, message: 'CSV mal formado. Revisa las comillas y el separador de columnas.' }))
  const [header, ...rows] = result.data
  if (!header) return { students: [], issues: [{ message: 'El archivo está vacío.' }] }
  const fields = header.map(value => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  const required = ['dni', 'nombres', 'apellidos']
  if (required.some(field => fields.filter(f => f === field).length !== 1)) {
    return { students: [], issues: [{ message: 'La primera fila debe contener una sola columna dni, nombres y apellidos. Usa la plantilla.' }] }
  }
  if (!rows.length) issues.push({ message: 'El archivo no contiene estudiantes.' })
  if (rows.length > MAX_IMPORT_ROWS || result.meta.truncated) return { students: [], issues: [{ message: `El máximo es ${MAX_IMPORT_ROWS} estudiantes por archivo. Divide la lista.` }] }
  const seen = new Map<string, number>()
  const students: ImportStudent[] = []
  rows.forEach((values, index) => {
    const row = index + 2
    if (values.length !== fields.length) { issues.push({ row, message: 'La cantidad de columnas no coincide con la cabecera.' }); return }
    const dni = values[fields.indexOf('dni')].trim()
    const first_names = values[fields.indexOf('nombres')].trim().replace(/\s+/g, ' ')
    const last_names = values[fields.indexOf('apellidos')].trim().replace(/\s+/g, ' ')
    if (!/^\d{8}$/.test(dni)) issues.push({ row, message: 'El DNI es obligatorio y debe tener ocho dígitos. En Excel usa formato Texto para conservar los ceros iniciales.' })
    if (!first_names || first_names.length > 100) issues.push({ row, message: 'Los nombres son obligatorios y admiten hasta 100 caracteres.' })
    if (!last_names || last_names.length > 120) issues.push({ row, message: 'Los apellidos son obligatorios y admiten hasta 120 caracteres.' })
    if (seen.has(dni)) issues.push({ row, message: `DNI repetido en el archivo (también está en el registro ${seen.get(dni)}).` })
    else seen.set(dni, row)
    students.push({ row, dni, first_names, last_names })
  })
  return { students, issues }
}
