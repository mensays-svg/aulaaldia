'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { schoolContext } from '@/lib/school/context'
import { validDni, validUuid, schoolRoles } from '@/lib/school/validation'

export async function manageSchool(form: FormData) {
  const get = (key: string) => String(form.get(key) ?? '').trim()
  const school = get('school')
  const intent = get('intent')
  const { supabase, roles, school: currentSchool } = await schoolContext(school)
  const done = (message: string): never => redirect('/dashboard?' + new URLSearchParams({ school, message }).toString())
  if (!validUuid(school) || school !== currentSchool) done('Institución no válida.')
  const admin = roles.includes('administrador')
  const manager = admin || roles.includes('director')
  const registrar = manager || roles.includes('auxiliar')
  let error: { code?: string } | null = null
  if (intent === 'classroom' && manager) {
    const year = Number(get('year'))
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !['Inicial','Primaria','Secundaria'].includes(get('level')) || !get('grade') || get('grade').length > 40 || !get('section') || get('section').length > 40) done('Revisa el año, nivel, grado y sección.')
    ;({ error } = await supabase.from('classrooms').insert({ institution_id: school, academic_year: year, level: get('level'), grade: get('grade'), section: get('section') }))
  } else if (intent === 'student' && registrar) {
    if (!validUuid(get('classroom')) || !validDni(get('dni')) || !get('first_names') || get('first_names').length > 100 || !get('last_names') || get('last_names').length > 120) done('Revisa los nombres, apellidos, aula y DNI de ocho dígitos; el DNI es opcional.')
    ;({ error } = await supabase.from('students').insert({ institution_id: school, classroom_id: get('classroom'), dni: get('dni') || null, first_names: get('first_names'), last_names: get('last_names') }))
  } else if (intent === 'status' && registrar) {
    if (!validUuid(get('student'))) done('Estudiante no válido.')
    redirect('/dashboard/matriculas?' + new URLSearchParams({ school, student: get('student') }))
  } else if (intent === 'role' && admin) {
    if (!schoolRoles.includes(get('role') as typeof schoolRoles[number]) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('email')) || get('email').length > 254) done('Revisa el correo y el rol.')
    ;({ error } = await supabase.rpc('assign_school_role', { school, account_email: get('email'), assigned_role: get('role') }))
  } else if (intent === 'remove_role' && admin) {
    if (!validUuid(get('user')) || !schoolRoles.includes(get('role') as typeof schoolRoles[number])) done('Cuenta o rol no válido.')
    ;({ error } = await supabase.rpc('remove_school_role', { school, account_id: get('user'), removed_role: get('role') }))
    if (error?.code === 'P0001') done('No se puede retirar al último administrador.')
  } else if (intent === 'teacher' && manager) {
    if (!validUuid(get('user')) || !validUuid(get('classroom'))) done('Selecciona docente y aula.')
    ;({ error } = await supabase.from('teacher_assignments').insert({ institution_id: school, classroom_id: get('classroom'), user_id: get('user') }))
  } else if (intent === 'guardian' && manager) {
    if (!validUuid(get('user')) || !validUuid(get('student')) || !['Madre','Padre','Tutor/a','Otro apoderado'].includes(get('relationship'))) done('Revisa el apoderado y el estudiante.')
    ;({ error } = await supabase.from('student_guardians').insert({ institution_id: school, student_id: get('student'), user_id: get('user'), relationship: get('relationship') }))
  } else if ((intent === 'unlink_guardian' || intent === 'unlink_teacher') && manager) {
    if (!validUuid(get('user')) || !validUuid(get('target'))) done('Vínculo no válido.')
    const table = intent === 'unlink_guardian' ? 'student_guardians' : 'teacher_assignments'
    const column = intent === 'unlink_guardian' ? 'student_id' : 'classroom_id'
    ;({ error } = await supabase.from(table).delete().eq('institution_id', school).eq('user_id', get('user')).eq(column, get('target')))
  } else done('No tienes permiso para realizar esta acción.')
  if (error) {
    const message = error.code === '23505' ? 'El registro o vínculo ya existe.'
      : error.code === 'P0001' ? 'La persona debe crear su cuenta y confirmar el correo primero.'
      : error.code === '23503' ? 'El aula, estudiante o rol no pertenece a esta institución. Revisa la selección.'
      : 'No se pudo guardar. Revisa tus permisos y la configuración de la institución.'
    done(message)
  }
  revalidatePath('/dashboard')
  done('Cambios guardados.')
}
