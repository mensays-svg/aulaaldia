export function familyOnly(roles:string[]):boolean{return roles.includes('apoderado')&&!roles.some(r=>['administrador','director','auxiliar','docente'].includes(r))}
export function teacherWorkspace(roles:string[]):boolean{return roles.includes('docente')&&!roles.some(r=>['administrador','director','auxiliar'].includes(r))}
export function auxiliaryOnly(roles:string[]):boolean{return roles.includes('auxiliar')&&!roles.some(r=>['administrador','director','docente','apoderado'].includes(r))}
export type SchoolLink = { id: string; title: string; description: string; path: string; icon: string }
const links: Record<string, SchoolLink> = {
 attendance: {id:'attendance',title:'Asistencia de mis hijos',description:'Comprueba sus ingresos y salidas del colegio.',path:'/dashboard/asistencia',icon:'calendar'},
 overview: { id:'overview', title:'Inicio', description:'Tu espacio de trabajo escolar.', path:'/dashboard', icon:'grid' },
 direction: { id:'direction', title:'Vista de dirección', description:'Consulta los indicadores y reportes generales de la institución.', path:'/dashboard/reportes/direccion', icon:'chart' },
 gate: { id:'gate', title:'Entrada y salida', description:'Consulta ingresos, salidas autorizadas y carnets QR.', path:'/dashboard/porteria', icon:'scan' },
 teacherReports: { id:'teacherReports', title:'Mis grados y secciones', description:'Reportes por grado, sección y estudiante, con gráficas y PDF.', path:'/dashboard/reportes/docente', icon:'chart' },
 gateRooms: { id:'gateRooms', title:'Reportes por salón', description:'Consulta ingresos, tardanzas, salidas y retornos por salón.', path:'/dashboard/porteria/salones', icon:'chart' },
 classes: { id:'classes', title:'Asistencia por clase', description:'Abre tus sesiones y registra la asistencia de cada clase.', path:'/dashboard/clases', icon:'calendar' },
 behavior: { id:'behavior', title:'Comportamiento', description:'Revisa el seguimiento y las evaluaciones de comportamiento.', path:'/dashboard/comportamiento', icon:'heart' },
 reports: { id:'reports', title:'Reportes', description:'Consulta asistencia y comportamiento por estudiante y periodo.', path:'/dashboard/reportes', icon:'chart' },
 enrollment: { id:'enrollment', title:'Matrículas', description:'Consulta el historial de aulas y matrículas por año escolar.', path:'/dashboard/matriculas', icon:'folder' },
 pdf: { id:'pdf', title:'Reportes PDF', description:'Descarga los reportes disponibles desde tu panel.', path:'/dashboard#pdf-reports', icon:'folder' },
 students: { id:'students', title:'Estudiantes', description:'Busca estudiantes y consulta sus datos escolares.', path:'/dashboard#students', icon:'users' },
 rooms: { id:'rooms', title:'Aulas', description:'Consulta los niveles, grados y secciones disponibles.', path:'/dashboard#classrooms', icon:'book' },
 people: { id:'people', title:'Personas y vínculos', description:'Gestiona docentes, apoderados y sus vínculos escolares.', path:'/dashboard#people', icon:'users' },
}
export function roleNavigation(roles: string[]): SchoolLink[] {
 if(familyOnly(roles))return ['overview','attendance','behavior','reports'].map(id=>({...links[id],...(id==='reports'?{title:'Reportes y PDF'}:{})}))
 if(teacherWorkspace(roles))return ['overview','classes','behavior','teacherReports'].map(id=>({...links[id],...(id==='classes'?{title:'Abrir clase / Asistencia QR'}:{}),...(id==='reports'?{title:'Reporte individual / PDF'}:{})}))
 if(auxiliaryOnly(roles))return ['overview','gate','gateRooms','reports'].map(id=>({...links[id],...(id==='gate'?{title:'Escanear QR / Portería',description:'Registra ingresos, salidas autorizadas y retornos. Prioriza QR; usa DNI o nombres si no trae carnet.'}:{}),...(id==='reports'?{title:'Reporte individual / PDF'}:{})}))
 const manager=roles.some(r=>['administrador','director'].includes(r))
 const ids=['overview']
 if(roles.includes('docente'))ids.push('teacherReports')
 if(manager)ids.push('direction')
 if(manager||roles.includes('auxiliar'))ids.push('gate')
 if(manager||roles.includes('docente')||roles.includes('apoderado'))ids.push('classes','behavior')
 if(roles.length)ids.push('pdf','reports','enrollment','students','rooms')
 if(!manager&&!roles.includes('auxiliar')&&roles.length)ids.push('gate')
 if(manager)ids.push('people')
 return ids.map(id=>{
  const item={...links[id]}
  if(id==='classes'&&!manager&&!roles.includes('docente'))item.description='Consulta la asistencia publicada de tus estudiantes, clase por clase.'
  if(id==='behavior'&&!manager&&!roles.includes('docente'))item.description='Consulta las evaluaciones y los seguimientos compartidos por el colegio.'
  if(id==='gate'&&(manager||roles.includes('auxiliar')))item.description='Registra ingresos, salidas autorizadas y retornos. Usa DNI o QR.'
  if(id==='enrollment'&&manager)item.description='Gestiona matrículas por año, cambios de aula, retiros y reingresos.'
  return item
 })
}
export function roleHome(roles:string[]) {
 if(roles.includes('administrador'))return{title:'Tu institución, en un solo lugar',description:'Organiza estudiantes, aulas y accesos. Acompaña el trabajo diario de tu comunidad educativa.',primary:'people',cards:['direction','enrollment','gate','classes'],scope:'Estudiantes de la institución'}
 if(roles.includes('director'))return{title:'Una mirada a tu comunidad educativa',description:'Consulta los reportes de la institución y acompaña la asistencia y el desarrollo de tus estudiantes.',primary:'direction',cards:['reports','enrollment','behavior','classes'],scope:'Estudiantes de la institución'}
 if(roles.includes('auxiliar'))return{title:'Cada ingreso y salida, al día',description:'Registra los movimientos del colegio y consulta a tus estudiantes desde un mismo espacio.',primary:'gate',cards:['gate','gateRooms','reports'],scope:'Estudiantes de la institución'}
 if(roles.includes('docente'))return{title:'Todo listo para tu próxima clase',description:'Registra la asistencia de tus aulas y acompaña el comportamiento de tus estudiantes.',primary:'classes',cards:['classes','behavior','teacherReports'],scope:'Estudiantes de tus aulas'}
 return{title:'Más cerca de su día a día',description:'Acompaña la asistencia y el comportamiento de los estudiantes vinculados a tu cuenta.',primary:'attendance',cards:['attendance','behavior','reports'],scope:'Estudiantes vinculados a tu cuenta'}
}
export function schoolHref(path:string,school?:string):string {
 const [base,hash]=path.split('#')
 return base+(school?'?'+new URLSearchParams({school}):'')+(hash?'#'+hash:'')
}
