# Reportes individuales y descarga PDF

## Activación

Si las cinco migraciones anteriores ya están instaladas, ejecutar **solo** `migrations/202611050006_student_reports.sql` una vez en Supabase SQL Editor. No repetir scripts anteriores ni bootstrap. Esta actualización agrega una función de consulta; no modifica los registros escolares existentes.

Una instalación nueva requiere las seis migraciones en orden y después el bootstrap. Los periodos se configuran en Comportamiento; se reutilizan para delimitar las fechas de todo el reporte.

## Uso

1. Abrir **Reportes** desde el panel, elegir un periodo y buscar al estudiante por DNI, apellidos o nombres. Se muestran hasta 20 coincidencias según los permisos de la cuenta. Por defecto se selecciona un periodo que incluya la fecha actual de Lima, o el más reciente que ya haya comenzado.
2. Abrir el reporte. Contiene resumen de asistencia, movimientos de portería, asistencias de clases cerradas, evaluación publicada y resúmenes de comportamiento comunicados a la familia.
3. Pulsar **Descargar PDF** para obtener un archivo PDF real con las mismas secciones. Alternativamente, **Imprimir / Guardar como PDF** abre el diálogo del navegador y oculta el buscador y controles.
4. Desde una ficha de Comportamiento también se puede ir directamente al reporte del estudiante y periodo seleccionados.

Cada apertura y cada descarga vuelve a comprobar la sesión y los permisos y consulta los datos disponibles en ese momento. Si hay cambios entre abrir la web y descargar, el PDF puede reflejar la versión más reciente. El documento muestra su fecha/hora de emisión en America/Lima.

## Privacidad y alcance

- Director/administrador: reportes de su institución.
- Docente: estudiantes actualmente asignados; el detalle de clases respeta los permisos de las sesiones, por lo que no añade clases históricas a las que no tenga acceso.
- Apoderado: únicamente sus hijos vinculados, incluidas sus sesiones cerradas y publicaciones disponibles.
- Auxiliar sin otro rol: reporte de portería; no recibe notas de conducta ni asistencia por clase por esta vía.
- Sin asignación o sin sesión iniciada: no hay acceso.

Incluso al descargar como director, el reporte es una versión de seguimiento apta para consulta familiar: no contiene borradores de clase o conducta, descripciones internas de incidencias, versiones reservadas del estudiante, anotaciones internas de seguimiento, auditoría ni notas libres internas de portería. Usa solo los resúmenes revisados y los seguimientos marcados como familiares. Las observaciones de asistencias de clase pertenecen a sesiones cerradas y ya son consultables por la familia en ese módulo.

Las notas publicadas mantienen la rúbrica y referencia institucional de la evaluación. No se calcula un promedio ni se descuentan puntos al generar el reporte. Reabrir una evaluación o retirar un resumen lo excluye de las próximas descargas. Los PDF ya descargados son documentos del momento de emisión.

El reporte no inventa faltas por días sin ingreso ni agrupa tardanzas de colegio y clases como una penalización. Los días sin registros pueden tener distintas causas; no existe todavía un calendario escolar para determinar ausencias de portería.

No es un certificado oficial ni incorpora firmas digitales o envío por correo/WhatsApp. Los reportes agregados de dirección ya están disponibles en [su propio módulo](DIRECCION.md). La exportación Excel y los comparativos entre periodos quedan fuera de esta entrega.

## Datos completos y PDF

La función devuelve todos los registros del estudiante dentro del periodo y sus permisos, sin aplicar las muestras de 100 incidencias o el límite REST de 1000 filas a las secciones del reporte. Cada descarga trabaja sobre una consulta estable de base de datos. No hace cambios ni guarda copias en un almacenamiento público.

La ruta `/dashboard/reportes/pdf` requiere sesión y devuelve `application/pdf` con descarga adjunta y `Cache-Control: private, no-store`. No hay enlaces públicos ni uso de service_role.

El PDF usa fuentes DejaVu locales con licencia incluida en `assets/fonts/LICENSE.txt`; no descarga fuentes externas. `next.config.ts` incluye explícitamente esas fuentes en el paquete de la ruta para Vercel. Las páginas se numeran y repiten cabecera de estudiante y de tablas. Las filas muy largas se dividen entre páginas conservando su contenido. Un carácter que las fuentes no puedan representar aparece mediante su código Unicode `[U+...]` en lugar de eliminarlo silenciosamente.

## Validación

- `npm run test:reports`: cadena completa de migraciones en PostgreSQL embebido (PGlite); permisos entre instituciones/familias, alcance de docentes/auxiliares, exclusión de borradores y notas internas, publicaciones retiradas y reporte con más de 1000 movimientos. No toca Supabase real.
- `npm run test:report-pdf`: genera PDF desde una ficha ficticia con tildes, más de 100 clases y una incidencia de varias páginas; valida estructura, paginación y secciones compartidas con la web. El artefacto de prueba queda en `/tmp/aulaaldia-reporte-prueba.pdf`.
- `npm run build`: TypeScript y compilación.
- Prueba web: sin sesión, tanto el reporte como su descarga deben redirigir al login. Después de activar, probar con una cuenta de apoderado que solo pueda abrir a sus hijos y descargar el PDF de uno de ellos.

En esta entrega también se comprobó el texto del PDF con `pdftotext` y se revisó visualmente una página. Esas utilidades no son necesarias en Vercel: la aplicación genera el documento directamente con pdf-lib.
