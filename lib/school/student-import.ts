import Papa from 'papaparse'

export const MAX_IMPORT_ROWS = 500
export const MAX_IMPORT_BYTES = 256 * 1024
export type ImportStudent = { row: number; dni: string; first_names: string; last_names: string; academic_year: number; level: string; grade: string; section: string }
export type ImportIssue = { row?: number; message: string }
export type ParsedStudents = { students: ImportStudent[]; issues: ImportIssue[] }
export function normalizeGrade(value: string): string {
  const key = value.toLowerCase().trim().replace(/grados?|años?/g, '').replace(/[\s.º°ª]/g, '')
  const aliases: Record<string, string> = { primer: '1', primero: '1', segundo: '2', tercero: '3', tercer: '3', cuarto: '4', quinto: '5', sexto: '6', '1ro': '1', '1ero': '1', '1er': '1', '2do': '2', '3ro': '3', '3er': '3', '4to': '4', '5to': '5', '6to': '6' }
  return aliases[key] ?? key
}
export function classroomKey(room: { academic_year: number; level: string; grade: string; section: string }): string {
  return JSON.stringify([room.academic_year, room.level.trim().toLowerCase(), normalizeGrade(room.grade), room.section.trim().toUpperCase()])
}
export function classroomLabel(room: { academic_year: number; level: string; grade: string; section: string }): string {
  return `${room.academic_year} · ${room.level} ${room.grade} · ${room.section}`
}
export function parseStudentsCsv(text: string): ParsedStudents {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy', dynamicTyping: false, preview: MAX_IMPORT_ROWS + 2,
    delimitersToGuess: [',', ';', '\t'],
  })
  const issues: ImportIssue[] = result.errors.map(e => ({ row: e.row === undefined ? undefined : e.row + 1, message: 'CSV mal formado. Revisa las comillas y el separador de columnas.' }))
  const [header, ...rows] = result.data
  if (!header) return { students: [], issues: [{ message: 'El archivo está vacío.' }] }
  const fields = header.map(value => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).map(f => f === 'ano' ? 'anio' : f)
  const required = ['dni', 'nombres', 'apellidos', 'anio', 'nivel', 'grado', 'seccion']
  if (required.some(field => fields.filter(f => f === field).length !== 1)) {
    return { students: [], issues: [{ message: 'Usa la plantilla única con las columnas dni, nombres, apellidos, año, nivel, grado y sección.' }] }
  }
  if (!rows.length) issues.push({ message: 'El archivo no contiene estudiantes.' })
  if (rows.length > MAX_IMPORT_ROWS || result.meta.truncated) return { students: [], issues: [{ message: `El máximo es ${MAX_IMPORT_ROWS} estudiantes por archivo. Divide la lista.` }] }
  const seen = new Map<string, number>()
  const students: ImportStudent[] = []
  rows.forEach((values, index) => {
    const row = index + 2
    if (values.length !== fields.length) { issues.push({ row, message: 'La cantidad de columnas no coincide con la cabecera.' }); return }
    const get = (name: string) => values[fields.indexOf(name)].trim()
    const dni = get('dni')
    const first_names = get('nombres').replace(/\s+/g, ' ')
    const last_names = get('apellidos').replace(/\s+/g, ' ')
    const academic_year = Number(get('anio'))
    const level = ({ inicial: 'Inicial', primaria: 'Primaria', secundaria: 'Secundaria' } as Record<string,string>)[get('nivel').toLowerCase()] ?? ''
    const grade = normalizeGrade(get('grado'))
    const section = get('seccion').toUpperCase()
    if (!/^\d{8}$/.test(dni)) issues.push({ row, message: 'El DNI es obligatorio y debe tener ocho dígitos. En Excel usa formato Texto para conservar los ceros iniciales.' })
    if (!first_names || first_names.length > 100) issues.push({ row, message: 'Los nombres son obligatorios y admiten hasta 100 caracteres.' })
    if (!last_names || last_names.length > 120) issues.push({ row, message: 'Los apellidos son obligatorios y admiten hasta 120 caracteres.' })
    if (!/^\d{4}$/.test(get('anio')) || academic_year < 2000 || academic_year > 2100) issues.push({ row, message: 'El año debe tener cuatro dígitos, entre 2000 y 2100.' })
    if (!level) issues.push({ row, message: 'El nivel debe ser Inicial, Primaria o Secundaria.' })
    const validGrade = level === 'Inicial' ? /^[345]$/.test(grade) : level === 'Primaria' ? /^[1-6]$/.test(grade) : /^[1-5]$/.test(grade)
    if (!validGrade) issues.push({ row, message: 'Revisa el grado: Inicial 3, 4 o 5 años; Primaria 1 a 6; Secundaria 1 a 5.' })
    if (!section || section.length > 40) issues.push({ row, message: 'La sección es obligatoria y admite hasta 40 caracteres.' })
    if (seen.has(dni)) issues.push({ row, message: `DNI repetido en el archivo (también está en el registro ${seen.get(dni)}).` })
    else seen.set(dni, row)
    students.push({ row, dni, first_names, last_names, academic_year, level, grade, section })
  })
  return { students, issues }
}
