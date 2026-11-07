# Docente: sesión primero, QR y reportes de sus aulas

## Activación

Con 001–009 instaladas, ejecutar **solo** `migrations/202611070010_teacher_qr_reports.sql`, una vez en Supabase SQL Editor. Para una instalación nueva, aplicar 001–010 en orden y luego bootstrap. No repetir migraciones anteriores.

La actualización añade apertura/reanudación de sesión, registro QR de clase con idempotencia y reportes docentes por grado/sección. No cambia las marcaciones existentes ni los registros de portería. El auxiliar sigue atendiendo exclusivamente portería según la migración 009.

## Inicio del docente

Una cuenta docente sin rol de administración/dirección/auxiliar ve primero sus sesiones abiertas de hoy y **Abrir sesión y llamar asistencia**. Se eligen únicamente sus aulas asignadas, curso, fecha y horario. El docente responsable es su propia cuenta. Las opciones únicas de aula/curso se preseleccionan.

**Abrir sesión e iniciar QR** lleva directamente a la lista de esa sesión y abre la cámara. Si ya existe una sesión borrador idéntica (aula, curso, docente, fecha y horario), se continúa sin duplicarla. Si está cerrada, no se crea otra ni se reabre automáticamente. Los solapamientos conservan sus validaciones.

Si faltan cursos o asignación de aula, Dirección/Administración debe configurarlos. No se inventan horarios ni se decide automáticamente qué curso corresponde a un docente; la asignación vigente es por aula.

## Llamado con QR

1. Abrir o continuar una sesión. Antes de ello no existe registro QR de clase.
2. Escanear con cámara o lector externo. Un QR válido de un estudiante activo **incluido en la lista fija de esa sesión** registra Presente en el borrador, dentro de su fecha y horario de Lima.
3. Verificar el nombre y el contador. Se conserva la lista y la cámara queda lista para otra lectura; no se solicita confirmación alumno por alumno. El mismo carnet consecutivo se ignora en cámara.
4. Si ya tiene marcación, se conserva su estado: QR no reemplaza una falta, tardanza o justificación. Una lectura repetida no duplica ni aumenta la revisión.
5. Si portería indica salida, se avisa y no se marca automáticamente. El docente revisa el caso en la fila; la referencia de portería no determina la asistencia de clase.
6. **Sin QR:** buscar DNI o apellidos/nombres dentro de la lista y registrar manualmente. No traer el carnet no constituye falta. **Revisar solo pendientes** permite atender excepciones.
7. Al terminar, **Guardar y publicar asistencia**. Las lecturas QR ya están guardadas como borrador, pero siguen sin publicarse hasta cerrar. Las filas pendientes nunca se convierten automáticamente en faltas. Puede guardarse un borrador y continuar después.

Una edición manual pendiente de guardar bloquea temporalmente QR para evitar perderla. Después de guardar el borrador se puede continuar. Las correcciones de marcaciones guardadas conservan motivo obligatorio; las justificaciones requieren explicación. No hay deducción automática de notas ni clasificación automática de tardanza a clase.

El registro de cada QR se guarda en una transacción con su identificador de intento, actor y revisión. Si hay cambios simultáneos, se exige recargar; no se sobrescriben. Si se pierde la respuesta, reintentar el mismo carnet con el mismo intento no duplica el registro. Un QR reemplazado, una lista ajena, una sesión cerrada/fuera de horario o un permiso retirado impiden registrar.

## Comportamiento y reportes

Comportamiento conserva cuatro criterios, nota final, rúbrica, sustento y publicación. Solo estudiantes de las aulas asignadas, según los permisos existentes.

**Mis grados y secciones:** elegir periodo y aula asignada para consultar indicadores, gráficas, detalle y PDF del aula. Incluye accesos a los PDF individuales. Solo usa evaluaciones publicadas, asistencia de sesiones cerradas autorizadas y datos comunicados; no incluye borradores ni anotaciones internas.

El reporte del aula se limita también a estudiantes que actualmente pertenecen a alguna de las aulas asignadas al docente. Una matrícula histórica no concede acceso a un estudiante trasladado a aulas ajenas. La selección histórica se conserva dentro de ese alcance; la asignación docente actual sigue siendo necesaria. No se cambia el reporte institucional exclusivo de Dirección/Administración.

Las cuentas con varios roles conservan los permisos explícitos de esos roles; el reporte agrupado docente mantiene su filtro de aulas/estudiantes asignados incluso si también existe rol auxiliar.

## Validación

- `npm run test:teacher-qr`: aplica las diez migraciones en PGlite; sesiones reanudables, QR repetidos y reintentos, revisiones, horario, lista ajena, alumno inactivo, salida en portería, publicación, privacidad de reportes y retirada de asignación.
- `npm run test:teacher-pdf`: genera el PDF con un reporte producido por esas pruebas y comprueba alcance/privacidad, gráficas, orientación y enlace.
- `npm run test:quick-attendance`, `npm run test:navigation`, `npm run build`: guardado/publicación, menú y compilación.

Se prueba el flujo de cámara con decodificador simulado en navegador; comprobar además los permisos y lectura física en el teléfono/lector que se usará en clase. Las pruebas no modifican Supabase real.
