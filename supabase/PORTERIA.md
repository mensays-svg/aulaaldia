# Entrada y salida del colegio

## Activación

En una instalación que ya tiene la base escolar y el formato único, ejecutar **solo** `migrations/202611050003_gate_attendance.sql` una vez en Supabase SQL Editor. No repetir los scripts anteriores ni el bootstrap. La app muestra un aviso si el módulo aún no está instalado. La clave publicable no puede instalar tablas ni funciones.

En una instalación nueva, aplicar las migraciones en orden y después el bootstrap. Los procesos de desarrollo deben iniciarse otra vez tras restaurar un entorno; en la nube con Node 24 usar `NODE_USE_ENV_PROXY=1 npm run dev`.

## Uso

1. Iniciar sesión como auxiliar, director o administrador. Abrir **Entrada y salida** desde el panel.
2. Buscar DNI exacto de ocho dígitos o nombres/apellidos. Se muestran hasta 20 coincidencias. Seleccionar y verificar identidad y aula.
3. Confirmar entrada, salida de jornada, salida anticipada o retorno según el estado actual.
4. Para salida anticipada, indicar motivo, nombre de quien autoriza, persona que recoge cuando corresponda y si se espera retorno durante el mismo día. El auxiliar debe verificar la autorización por el procedimiento de la institución: escribir un nombre no constituye una firma digital ni una aprobación remota.
5. Consultar el historial por fecha. Muestra 50 registros por página. Los datos se filtran en PostgreSQL por institución y permisos del usuario.

## Estados diarios

- Sin ingreso: solo permite entrada.
- Dentro: permite salida de jornada o anticipada.
- Salida anticipada con retorno previsto: solo permite retorno.
- Fuera sin retorno previsto: permite una nueva entrada/reingreso.

Las horas se guardan en el servidor y se muestran en **America/Lima**. El estado se calcula por día local; no se diseñó para turnos nocturnos que cruzan medianoche. No se marcan faltas automáticamente por ausencia de movimientos. No se altera la asistencia por clase, que será otro módulo.

Cada intento tiene un UUID único. Reintentar la misma solicitud conserva su resultado sin duplicar el evento. Si una conexión se pierde, no cambies los datos antes de reintentar o revisa primero el historial. Los movimientos son de solo anexado: no se permiten cambios o borrados directos desde la app. Una corrección formal con motivo y trazabilidad requerirá un flujo posterior; no se debe editar directamente un registro para ocultar un error.

## Puntualidad

Dirección y administración configuran por aula la hora de ingreso y tolerancia (0–120 minutos). El primer ingreso es tardanza únicamente si supera la hora más la tolerancia. Si no existe horario, se registra **Sin horario**, sin inventar una clasificación. Retornos y reingresos posteriores no crean otra tardanza del día. Cambiar un horario afecta futuros ingresos y no recalcula el pasado.

Esta marcación no determina si la tardanza está justificada, no descuenta puntos de conducta y no impone medidas disciplinarias. El ingreso nunca se bloquea por llegar tarde.

## Carnets QR

Con el estudiante seleccionado, pulsar **Ver / generar carnet QR**. Se puede imprimir el carnet o descargar la imagen QR. El contenido es `aulaaldia:student:<UUID aleatorio>`, sin DNI ni nombre. Solo personal autorizado de la institución puede resolver ese código. Generarlo otra vez conserva el mismo código; **Reemplazar QR** invalida el anterior.

Para leerlo, pulsar **Abrir cámara QR** y conceder acceso en el navegador. Requiere HTTPS (Vercel) o localhost. El lector intenta usar la cámara trasera y detiene la cámara al leer o cerrar. Si el dispositivo no permite cámara, usar DNI/apellidos o pegar la lectura de un lector externo en el buscador. No se guardan fotografías ni vídeo. Un escaneo identifica al alumno, pero no registra movimientos automáticamente ni autoriza una salida: siempre se verifica y confirma.

## Acceso

- Auxiliar, director y administrador: búsqueda, QR y marcaciones de su institución.
- Director y administrador: también configuran los horarios.
- Docente: consulta de movimientos de sus estudiantes asignados.
- Apoderado: consulta de sus hijos vinculados, sin lectura de otros estudiantes ni acceso a los códigos QR.
- Cuenta sin asignación o sin sesión: sin datos escolares.

Los códigos no son credenciales de inicio de sesión. Un carnet puede copiarse; ante pérdida, reemplazarlo y comprobar la identidad del estudiante antes de marcar.

## Validación

- `npm run test:gate`: migración real en PostgreSQL embebido (PGlite), estados, autorizaciones obligatorias, reintentos, horarios, aislamiento entre instituciones, permisos familiares/docentes y códigos QR revocados.
- `npm run test:gate-qr`: generación de una imagen QR y lectura con el decodificador utilizado por el lector; interpretación del código y límites de fecha de Lima.
- `npm run build`: compilación y TypeScript.
- Comprobar acceso anónimo a `/dashboard/porteria`: debe redirigir al login.

Las pruebas no crean usuarios ni movimientos en el Supabase real. Después de activar, probar el recorrido con un estudiante ficticio, confirmar el historial y probar la cámara en el teléfono que usará el auxiliar. El funcionamiento físico de la cámara no queda demostrado por la prueba de codificación/decodificación.
