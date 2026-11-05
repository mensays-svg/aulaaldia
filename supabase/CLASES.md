# Asistencia por clase

## Activación

Si la base escolar, importación y portería ya están instaladas, ejecutar **solo** `migrations/202611050004_class_attendance.sql` una vez en Supabase SQL Editor. No repetir las migraciones anteriores ni el bootstrap. Una instalación nueva requiere las cuatro migraciones en orden y después el bootstrap. No se necesita una clave service_role en la aplicación.

## Preparación de personas y cursos

1. El docente debe registrarse y confirmar su correo.
2. Administración le asigna el rol **Docente** y sus aulas en **Personas y vínculos**. Una persona puede conservar otros roles, como administrador, y ser también docente.
3. En **Asistencia por clase → Preparar una clase → Registrar curso**, dirección o administración crea los cursos que correspondan (por ejemplo, Matemática).
4. El docente crea una sesión con un aula asignada, curso, fecha, inicio, fin y tema opcional. Dirección o administración puede crearla en nombre de un docente que ya tenga el aula asignada.

El año del aula debe coincidir con el año de la sesión. No se aceptan sesiones que se superpongan para el aula o el docente. Los horarios se interpretan en **America/Lima** y no cruzan medianoche. Se pueden preparar sesiones futuras, pero no guardar asistencia antes de su hora de inicio. La asignación actual es por aula, no por curso: la distribución detallada de cursos y el horario recurrente serán una ampliación posterior.

## Registro

La sesión guarda una lista fija de los estudiantes activos del aula al crearla (entre 1 y 1000). Alumnos nuevos o cambios posteriores de matrícula no reescriben esa lista. Deben registrarse los alumnos antes de preparar las sesiones que los incluyan.

Estados: **Presente, Tardanza, Falta, Ausencia justificada**. No se marca automáticamente a nadie; una fila sin selección permanece pendiente. Una ausencia justificada necesita una explicación breve, sin diagnósticos médicos.

El botón **Marcar pendientes como presentes** es una acción explícita del docente: no cambia filas marcadas y deja pendientes a quienes figuran con salida en la referencia de portería. El docente debe revisar cada caso.

Se puede guardar un avance. Cambiar el estado o la observación de una fila ya guardada requiere un motivo de corrección. Todo el lote se guarda en una transacción; si una fila falla, se revierte el lote completo, incluido su historial.

Para cerrar y publicar, todas las filas deben estar guardadas con estado. Una sesión cerrada no permite modificar asistencias. Solo dirección o administración puede reabrirla con motivo; las correcciones y el nuevo cierre quedan registrados. Mientras está reabierta, los apoderados dejan de verla hasta que vuelva a cerrarse.

Cada guardado comprueba la revisión de la sesión. Si otra persona guardó o cerró primero, el sistema exige recargar antes de continuar. Un reintento no duplica cambios y no sobrescribe silenciosamente el trabajo de otro usuario.

## Referencia de portería

La ficha muestra el último movimiento del estudiante en esa fecha hasta el menor valor entre la hora actual y el fin de la sesión. Esto permite advertir salidas autorizadas y retornos durante la clase, sin confundirlos con movimientos posteriores al horario de la sesión. Se indica la hora de corte utilizada.

**La asistencia por clase se decide y guarda por separado**. Entrar al colegio no marca presente en una clase; una salida autorizada tampoco cambia automáticamente a ausencia justificada. No se escriben movimientos de portería desde este módulo.

## Permisos

- Docente responsable y actualmente asignado: guardar y cerrar sus sesiones. Puede consultar otras sesiones de las aulas que tenga asignadas, sin editarlas si otro docente es responsable.
- Director y administrador: supervisar todas las sesiones de su institución, crear cursos/sesiones y corregir/reabrir con trazabilidad.
- Apoderado: consultar únicamente las filas de sus hijos vinculados en sesiones cerradas; no ve borradores, compañeros ni el historial interno de correcciones.
- Auxiliar sin otro rol: mantiene el control de portería; no puede crear ni modificar asistencia por clase.
- Sin asignación o sin sesión iniciada: sin acceso a datos escolares.

Las tablas tienen RLS y los cambios se realizan mediante funciones que validan roles, institución, docente, lista de sesión, estado y revisión. No se permiten escrituras ni borrados directos desde la app.

## Prueba con datos ficticios

Crear un curso, asignar un aula al docente y preparar una sesión con fecha/hora ya transcurridas dentro del año del aula. Marcar algunos alumnos, guardar, comprobar que no se puede cerrar con pendientes, completar los demás y cerrar. Consultar con una cuenta de apoderado vinculada; debe ver solo a su hijo. Comprobar que corregir exige un motivo y que reabrir solo está disponible para dirección/administración.

`npm run test:classes` prueba la cadena de migraciones en PostgreSQL embebido (PGlite), con identidades simuladas. Cubre permisos, sesiones, superposición horaria, lista fija, guardado parcial, reversión de lotes, versiones, justificaciones, correcciones, publicación familiar y referencia temporal de portería. No modifica datos reales.

La edición/cancelación de fechas y aulas de una sesión ya creada, la incorporación de alumnos a listas históricas, los horarios recurrentes y los reportes exportables no forman parte de esta entrega. La evaluación de conducta y su rúbrica siguen pendientes.
