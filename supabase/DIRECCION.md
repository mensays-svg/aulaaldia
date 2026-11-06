# Reportes generales para dirección

## Activación

Si las seis migraciones anteriores ya están instaladas, ejecutar **solo** `migrations/202611050007_management_reports.sql` una vez en Supabase SQL Editor. No repetir scripts anteriores ni bootstrap. Es una función de consulta: no cambia datos escolares.

Para una instalación nueva, ejecutar las ocho migraciones en orden y después el bootstrap.

## Uso

1. Entrar con el rol **Director** o **Administrador**.
2. Abrir **Reportes → Reportes generales para dirección**.
3. Elegir año escolar, periodo, nivel, grado/edad de Inicial, sección y estado del estudiante. Por defecto se incluyen activos e inactivos.
4. Pulsar **Aplicar filtros**. Al cambiar año/nivel/grado se ajustan las opciones dependientes. Las descargas usan los filtros ya aplicados, no los cambios aún sin enviar.
5. Consultar resumen institucional, resumen por aula, sesiones pendientes y detalle por estudiante.
6. Descargar el **PDF institucional horizontal** o usar la impresión del navegador.

El año del periodo debe coincidir con el año seleccionado. Los periodos se crean en Comportamiento. Un filtro sin coincidencias muestra cero registros; no se amplía silenciosamente a toda la institución.

## Qué se incluye

- Cantidad de estudiantes activos/inactivos y aulas seleccionadas, incluidas aulas vacías.
- Primeros ingresos al colegio, tardanzas, entradas a tiempo o sin horario y salidas anticipadas.
- Marcaciones de clases cerradas: presentes, tardanzas, faltas y ausencias justificadas.
- Sesiones cerradas, borradores ya iniciados pendientes de cierre y sesiones futuras programadas de las aulas seleccionadas.
- Cuatro criterios y nota final de conducta publicados por estudiante; evaluaciones pendientes, notas de 11 o más y menores de 11.
- Promedio descriptivo de las notas finales publicadas y conteos de reconocimientos/incidencias comunicados a familias.

No contiene textos internos, versiones reservadas del estudiante, notas libres de portería, observaciones individuales de clase ni borradores de conducta. Los borradores de asistencia solo se cuentan como sesiones pendientes/programadas; sus marcaciones no entran en la asistencia publicada.

## Cómo interpretar los datos

Con la migración 008 instalada, **la agrupación usa la última asignación de matrícula que se cruza con el periodo y su estado al cierre del periodo**. Un traslado posterior a un periodo terminado no mueve al estudiante de ese reporte. Si cambia de sección dentro del periodo, aparece una sola vez, en su última aula del periodo; los totales reúnen sus registros del periodo y cada marcación mantiene su aula original. No constituye una distribución de marcaciones por aula de origen.

Las fechas iniciales del padrón anterior son desconocidas: se conserva su asociación anual disponible y se avisa cuántas matrículas no tienen fecha inicial. No se certifican fechas oficiales ni se reconstruyen aulas que nunca fueron registradas. Los planes futuros no entran en el padrón del periodo. Sin la migración 008, la función 007 usa aula y estado actuales. Consulta [Matrículas](MATRICULAS.md) para activar la actualización.

Las sesiones pendientes se cuentan una vez por aula/sesión seleccionada, no una vez por alumno. El filtro de activo/inactivo afecta a los alumnos del resumen, no al calendario de sesiones del aula. Tener cero marcaciones publicadas no significa falta: puede no haber sesiones cerradas o registros todavía.

Cada fuente se agrega por separado antes de unirla: varios movimientos de portería, notas e incidencias del mismo estudiante no multiplican las cifras de otra fuente.

Las notas sin publicar permanecen sin nota: no se convierten en cero ni entran en el promedio. Una nota publicada de **0** es una nota real y sí se incluye. El promedio institucional se calcula sobre cada nota final publicada, no como promedio de promedios de aulas. Es solo un indicador: no asigna notas, cambia evaluaciones ni ejecuta una fórmula de conducta.

No se suman tardanzas del colegio y clases como penalización, ni se deducen faltas de días sin ingreso. El reporte no aplica sanciones ni reemplaza actas o certificados oficiales.

## Acceso y descarga

La función `management_period_report` comprueba que la cuenta tenga rol director/administrador de la institución solicitada antes de consultar datos. Docentes, auxiliares, apoderados y cuentas sin asignación no pueden usarla, ni siquiera llamando directamente a la API. La página y la ruta PDF tienen la misma restricción. Sus reportes individuales conservan los permisos anteriores.

La descarga `/dashboard/reportes/direccion/pdf` requiere sesión, devuelve `application/pdf` y tiene `Cache-Control: private, no-store`. El PDF se genera con fuentes locales incluidas explícitamente en el paquete de Vercel; no publica enlaces abiertos ni necesita service_role.

La vista web y el PDF comparten las mismas secciones y estadísticas. Cada solicitud consulta los datos vigentes: cambios entre abrir el reporte y descargar pueden aparecer en la descarga. El documento indica filtros y fecha/hora de emisión en Lima. Incluye todas las aulas/estudiantes de la selección, sin recortarlos al límite REST de 1000 filas. Para un PDF más corto, aplicar nivel, grado o sección.

## Validación

- `npm run test:management-reports`: migraciones completas en PostgreSQL embebido (PGlite); roles, instituciones, filtros normalizados, aulas vacías, activos/inactivos, separación de fuentes, exclusión de notas privadas/borradores, promedio ponderado por evaluaciones publicadas y más de 1000 estudiantes.
- `npm run test:management-pdf`: generación horizontal, notas cero frente a sin publicar, paginación y estudiantes de la última fila.
- `npm run test:report-pdf`: regresión del PDF individual después de compartir el motor de renderizado.
- `npm run build`: TypeScript y compilación.

Las pruebas utilizan datos ficticios en memoria y no cambian Supabase real. Después de activar, comprobar que Director ve la institución correcta, que los filtros coinciden con el alumnado conocido y que un apoderado no puede abrir la página ni descargar el PDF general.
