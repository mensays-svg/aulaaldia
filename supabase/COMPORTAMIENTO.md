# Comportamiento: evidencia, evaluación y consulta familiar

## Activación

Si las primeras cuatro migraciones ya están instaladas, ejecutar **solo** `migrations/202611050005_behavior.sql` una vez en Supabase SQL Editor. No repetir el bootstrap ni los scripts previos. Para una instalación nueva, ejecutar las cinco migraciones en orden y después el bootstrap.

## Qué se ha implementado

- Periodos de evaluación con nombre, año y fechas que define dirección/administración.
- Registro de versiones de rúbricas institucionales ya aprobadas: referencia documental, texto de criterios y responsable que las registra. No se puede editar una versión desde la app; una modificación se registra como otra versión.
- Reconocimientos e incidencias por presentación personal, puntualidad, convivencia o responsabilidad, con fecha/hora de Lima, lugar, hechos objetivos y versión del estudiante cuando esté disponible.
- Seguimiento de acuerdos/avances con estados pendiente, en seguimiento y cumplido. Son anotaciones nuevas, no borrados de antecedentes.
- Resumen revisado para consulta familiar, separado del registro interno y sin publicación automática.
- Borradores de evaluación con los cuatro criterios y nota final numéricos de 0 a 20, sustento y rúbrica aplicada.
- Publicación para los apoderados vinculados y reapertura por dirección/administración con motivo. Toda actualización de un borrador ya guardado exige motivo y comprueba su revisión para evitar sobrescrituras de otros evaluadores.
- Historial interno de operaciones, responsables y versiones previas en la base de datos.

## Alcance normativo y regla de nota final

El PDF aportado por el usuario, “Lineamientos para la gestión de la disciplina escolar en la Educación Básica”, numeral 5.7, señala una nota de conducta de 0 a 20 y considera desaprobatoria la nota menor a 11. No contiene una fórmula de promedio ni una tabla de descuentos por tardanzas para los cuatro criterios solicitados.

Los cuatro criterios y sus calificaciones en la app son institucionales: su uso debe estar contemplado en la rúbrica que apruebe la institución. La app no presenta estos cuatro criterios ni una conversión de letras como imposición del MINEDU.

**La nota final se consigna manualmente por el evaluador**, que debe aplicar los criterios aprobados y sustentar su decisión. No se ha implementado una fórmula automática: requiere que la institución entregue una regla concreta y aprobada para una implementación posterior. El texto de la rúbrica no se ejecuta como código ni se interpreta automáticamente para calcular notas.

Publicar exige cuatro notas, nota final, sustento de al menos 20 caracteres y una rúbrica registrada. No es posible publicar un periodo que aún no empezó. La app no verifica externamente la autenticidad de un acta; la persona con rol director/administrador confirma que registra criterios efectivamente aprobados. No se suministra ni siembra una rúbrica inventada para la institución real.

## Asistencia como referencia

Se muestran ingresos con tardanza al colegio, ingresos sin horario, salidas anticipadas y asistencia de clases cerradas, dentro de las fechas del periodo. Una entrada de portería se cuenta una sola vez como primer ingreso del día. Los retornos no suman otra tardanza. Las tardanzas por clase permanecen separadas de las de portería y no se suman para descontar puntos.

La app no asume que una tardanza sea injustificada. Las salidas de salud o urgencia no generan penalización. No se clasifica automáticamente una incidencia como falta leve/grave/muy grave ni se aplican sanciones. El trámite disciplinario formal, sus comunicaciones, firmas y garantías deben seguirse por los procedimientos de la institución; la ficha digital no sustituye esas actuaciones.

## Permisos y privacidad

- Auxiliar: registrar hechos y seguimientos internos de estudiantes de su institución; no puede evaluar, publicar notas ni comunicar resúmenes a las familias.
- Docente: registrar, revisar y evaluar estudiantes de sus aulas actualmente asignadas, con historial de cambios. Puede publicar una evaluación completa con rúbrica, pero no reabrir una evaluación publicada.
- Director/administrador: configurar periodos y rúbricas, supervisar, evaluar, revisar comunicaciones y reabrir evaluaciones con motivo.
- Apoderado: solo sus hijos vinculados; únicamente notas publicadas, resúmenes revisados y seguimientos marcados como familiares de registros comunicados.
- Cuenta sin asignación o sin sesión: sin acceso a datos escolares.

Las descripciones internas, la versión del estudiante y las anotaciones internas de seguimiento **no se entregan a familias por las tablas ni por la función de consulta**. Para comunicar un hecho, un docente o dirección redacta un resumen revisado sin identificar a otros estudiantes. Retirar la comunicación oculta también sus seguimientos familiares. Reabrir una evaluación la oculta temporalmente hasta publicarla de nuevo.

“Comunicar” significa habilitar consulta dentro de la aplicación. Esta entrega no envía correos, WhatsApp ni notificaciones externas.

## Recorrido de prueba

1. Abrir **Comportamiento** como director/administrador y crear un periodo que incluya las fechas de prueba.
2. Seleccionar un estudiante ficticio. Registrar un reconocimiento o incidencia y un seguimiento. Comprobar que es interno por defecto.
3. Como docente asignado o dirección, redactar un resumen y activar su consulta familiar. Verificar desde una cuenta de apoderado vinculada que no aparecen las notas internas ni datos de otros alumnos.
4. Guardar un borrador de evaluación. Sin rúbrica o campos completos, la publicación debe ser rechazada. Registrar una rúbrica solo cuando haya sido aprobada por la institución, no para simular aprobación en datos reales.
5. Completar los cuatro criterios, la nota final y el sustento según esa rúbrica; guardar y publicar. Comprobar la consulta familiar y el bloqueo de edición posterior.
6. Dirección puede reabrir con motivo. El evaluador corrige con motivo, guarda y vuelve a publicar.

Se muestran hasta 100 registros recientes por estudiante/periodo, 30 seguimientos por registro y 50 operaciones recientes del estudiante; los datos anteriores permanecen en la base de datos. La búsqueda muestra hasta 20 estudiantes; se puede afinar por DNI o apellidos.

`npm run test:behavior` ejecuta la cadena completa de migraciones en PostgreSQL embebido (PGlite), con identidades y rúbricas ficticias aisladas. Prueba permisos, borradores, publicación, reapertura, versiones, notas fuera de rango, privacidad de registros y evidencias de asistencia. No modifica Supabase real. `npm run build` verifica TypeScript y la compilación.
