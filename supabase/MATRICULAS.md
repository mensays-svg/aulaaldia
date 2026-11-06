# Matrículas por año escolar

## Activación

Si las migraciones 001–007 están instaladas, ejecutar **solo** `migrations/202611050008_enrollment_history.sql`, una vez en Supabase SQL Editor. Para instalación nueva, aplicar 001–008 en orden y luego bootstrap. No repetir scripts ya aplicados.

La migración conserva el padrón existente: un registro anual y una asignación del aula disponible por estudiante. La fecha inicial y los retiros anteriores quedan desconocidos, sin inventar fechas oficiales. No reconstruye años o aulas anteriores que nunca se registraron. No modifica marcaciones, sesiones, notas, familiares ni QR existentes.

## Uso y prueba

1. Entrar como Director o Administrador y abrir **Matrículas**. Buscar por DNI o nombres y abrir una ficha.
2. Crear antes las aulas destino en **Aulas**, con año, nivel, grado y sección.
3. En **Cambiar de aula o sección**, elegir un aula del mismo año actual y registrar motivo. Se cierra la asignación anterior con hora del servidor y se abre otra; se conserva el estudiante.
4. En **Registrar retiro**, consignar el motivo. El estudiante queda inactivo sin borrar registros. **Registrar reingreso** abre otra asignación dentro del mismo año actual.
5. **Preparar matrícula de otro año** crea un plan. Solo se activa en su año, según la fecha de Lima. Al activar, se cierra la matrícula activa de un año anterior; no se borra su historial. No hay promoción ni activación automática.
6. Para un aula completa, **Preparar renovación o promoción por aula**: elegir origen y destino de año posterior, revisar la lista, indicar motivo y confirmar la autorización institucional. Hasta 500 estudiantes, todo el lote o ninguno. No sobrescribe matrículas anuales existentes. Para activar después, revisar cada ficha en el año correspondiente.
7. Revisar un reporte de un periodo terminado después de cambiar de aula: conserva el aula del periodo. Revisar que el apoderado siga consultando únicamente a su estudiante y no vea motivos administrativos.

Cada estudiante tiene una matrícula por año y una sola matrícula activa. Los cambios guardan responsable, motivo, fecha/hora, revisión y estado anterior/nuevo. Un intento repetido con el mismo identificador no se duplica; una ficha desactualizada exige recargar. El historial administrativo muestra las últimas 100 operaciones; la base conserva todas.

## Accesos y registros

Solo Director y Administrador modifican matrículas. Auxiliar puede registrar perfiles nuevos, incluso por CSV; los de años futuros quedan planificados e inactivos, y los de años anteriores quedan históricos e inactivos. Para alumnos existentes se usa Matrículas, sin importar otra vez el DNI. El cambio directo de aula o estado en `students` queda restringido; nombre y DNI conservan sus permisos anteriores.

Las familias ven matrícula/asignaciones de sus hijos, sin motivos administrativos ni datos de compañeros. El docente conserva su alcance por aulas asignadas; una antigua asignación no da acceso al perfil actual del estudiante trasladado. Las listas de sesiones ya creadas permanecen fijas. Al crear una sesión, se toma el alumnado de las asignaciones vigentes en el instante de inicio de esa clase. Las listas de sesiones futuras ya preparadas tampoco se modifican automáticamente.

Portería exige una asignación válida del año y momento de la marcación. Un plan futuro no habilita entradas. Los horarios del aula destino deben configurarse en Portería si se desea clasificar tardanzas; no se copian automáticamente.

Los reportes generales usan una fila por estudiante y la última aula que se cruza con el periodo; el estado se interpreta al cierre. Los registros conservan su aula original. Los cambios dentro de un periodo abierto pueden cambiar su agrupación, sin alterar registros. Una matrícula inicial sin fechas se informa como tal; su asociación anual disponible no certifica asistencia ni fecha oficial.

## Validación

`npm run test:enrollments` aplica 001–007, crea datos educativos y luego activa 008 en PostgreSQL embebido (PGlite). Comprueba migración del padrón, transferencias, retiro/reingreso, planificación, activación, lotes atómicos, reintentos, revisiones, permisos, importación y conservación de reportes/registros. Los datos son ficticios; no cambia Supabase real.

Ejecutar también `npm run test:report-pdf`, `npm run test:management-pdf` y `npm run build`. Después de activar SQL en el proyecto real, completar el recorrido anterior con estudiantes de prueba.
