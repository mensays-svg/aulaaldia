# Auxiliar: portería con QR y reportes

## Activación

Con las migraciones 001–008 instaladas, ejecutar **solo** `migrations/202611070009_auxiliary_gate_role.sql`, una vez en SQL Editor. No repetir las anteriores ni bootstrap. Para instalación nueva, aplicar 001–009 en orden y luego bootstrap.

La app oculta y bloquea las acciones administrativas del auxiliar; la migración restringe también la API de Supabase: creación/importación/edición de estudiantes, creación y reemplazo de QR y consulta de matrículas reservadas. No borra personas, carnets, eventos ni historial. Un QR existente sigue funcionando para identificar al estudiante.

## Funciones y recorrido

- **Inicio:** abre directamente portería para una cuenta que solo tenga el rol auxiliar en la institución seleccionada. Cámara QR como acción principal; también lector externo. La búsqueda por DNI o apellidos/nombres queda en **¿No trae QR?**.
- **Identidad:** mostrar nombre, DNI y salón antes de confirmar. No se crea una foto ni se simula una identidad visual.
- **Movimiento:** entrada, salida de jornada, salida anticipada y retorno. El auxiliar confirma cada movimiento; el escaneo nunca registra automáticamente. La salida anticipada conserva motivo y autorización obligatorios; se añade quién recoge si corresponde.
- **Siguiente estudiante:** tras confirmar una lectura de cámara, vuelve a abrirse la cámara. Se ignora el mismo carnet consecutivo para no producir una salida accidental. Cerrar y abrir la cámara explícitamente permite releerlo; también se puede usar la búsqueda manual. Tras una búsqueda/lector externo, el foco vuelve a ese campo.
- **PDF individual:** disponible en la ficha y en el aviso del último movimiento registrado cuando existe un periodo. Usa por defecto el periodo vigente de Lima o el más reciente comenzado. Para otro periodo, abrir el reporte individual. Conserva el PDF visual ya implementado. El auxiliar ve portería; no se le conceden notas de comportamiento ni asistencia de cursos.
- **Reportes por salón:** elegir salón y fecha; muestra el padrón de matrícula de esa fecha, primeros ingresos, tardanzas, salidas, retornos y situación al último movimiento registrado. También descarga PDF del salón y acceso a PDF individual por alumno. Se puede elegir el periodo del PDF individual; es distinto de la fecha del reporte diario.

**Sin ingreso registrado no equivale a falta.** El docente sigue registrando la asistencia de cada clase. El padrón del reporte usa la última asignación de matrícula que se cruza con la fecha; si un alumno cambió de salón ese día, aparece una sola vez en el último salón. Sus movimientos originales no se modifican. Se distinguen matrículas inactivas y fechas iniciales desconocidas. No se admiten reportes diarios futuros ni fechas de otro año del salón.

Solo Dirección y Administración crean/importan estudiantes, administran carnets y configuran horarios. Auxiliar no crea aulas, no modifica matrículas, no asigna roles ni vínculos y no califica comportamiento. Las cuentas con varios roles conservan los permisos explícitos de sus otros roles; revisar sus asignaciones si deben funcionar únicamente como auxiliares.

## Prueba

1. Entrar con una cuenta cuyo único rol sea auxiliar. Verificar que no aparecen importación, matrículas, aulas administrativas ni conducta.
2. Escanear un carnet existente y comprobar identidad. Confirmar entrada; comprobar que se muestra el resultado y no se vuelve a leer automáticamente el mismo carnet.
3. Buscar otro estudiante sin carnet por DNI; probar también apellidos y nombres. Confirmar movimiento.
4. Probar salida anticipada sin autorización: debe rechazarse. Completar motivo/autorización y comprobar salida y retorno.
5. Elegir un salón en Reportes por salón. Comprobar quién ingresó, quién tiene tardanza y quién no tiene ingreso registrado. Descargar el PDF del salón y el individual.
6. Como auxiliar, intentar abrir Cargar estudiantes o modificar matrículas directamente: debe estar bloqueado. Dirección debe conservar ambas funciones.

`npm run test:auxiliary` aplica las nueve migraciones en PostgreSQL embebido, comprueba restricciones directas, QR existente, idempotencia, motivos de salida, fuentes del PDF individual, reportes históricos y separación de instituciones. Los datos son ficticios; no cambia Supabase real. `npm run test:navigation` comprueba accesos por rol y `npm run build` compila las páginas y PDF.
