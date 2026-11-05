# Activación de los módulos escolares

Esta entrega incorpora roles, instituciones, aulas, estudiantes y vínculos con docentes y apoderados. La autenticación ya existente se conserva.

## Instalar en tu proyecto Supabase

1. Guarda una copia de seguridad si ya tienes datos escolares. Esta migración crea tablas nuevas y se ejecuta una sola vez; ante un conflicto de nombres, no borres tablas para forzarla.
2. Abre el **SQL Editor** del proyecto Supabase que usa la app.
3. Pega el contenido completo de `migrations/202611050001_school_foundation.sql` y pulsa **Run**. Después ejecuta `migrations/202611050002_unified_student_import.sql` y `migrations/202611050003_gate_attendance.sql` en consultas separadas, en ese orden. Todo se aplica en una transacción. No necesita desactivar RLS ni usar service_role en la app.
4. Abre una nueva consulta. Copia `bootstrap.sql`, sustituye los valores del correo del administrador y nombre de la institución y ejecútala una sola vez. La cuenta elegida debe estar registrada con correo confirmado. Si la institución ya existe, revisa sus accesos antes de repetir este paso.
5. Inicia sesión en la web con esa cuenta. En el panel, crea aulas y registra estudiantes.
6. Pide a cada docente, auxiliar, director y apoderado que cree y confirme su cuenta. Como administrador, asigna sus roles por correo.
7. Vincula cada docente a sus aulas y cada apoderado a sus hijos, después de verificar su identidad y autorización.

Quien se registra sin una asignación ve una pantalla de acceso pendiente; no puede convertirse en administrador ni ver información de alumnos.

## Permisos

- Administrador: asignar y retirar roles, aulas, estudiantes y vínculos de su institución.
- Director: gestionar aulas, estudiantes y vínculos, y consultar el personal; no puede asignar roles.
- Auxiliar: consultar aulas y estudiantes de su institución, registrar estudiantes y activar/desactivar su ficha.
- Docente: consultar solo estudiantes de sus aulas asignadas.
- Apoderado: consultar solo estudiantes vinculados a su cuenta y sus aulas; no ve a los compañeros.
- Sin vínculo o sin sesión: no hay acceso a datos escolares.

Una cuenta puede tener varios roles e instituciones. Los permisos se suman dentro de la institución seleccionada. Retirar un rol docente o apoderado elimina sus vínculos asociados; el último administrador no puede retirarse. Los permisos también se aplican directamente en PostgreSQL mediante RLS y funciones con privilegios delimitados.

## Validación

`npm run test:permissions` instala el esquema en PostgreSQL embebido (PGlite), con usuarios Auth simulados, y comprueba aislamiento entre instituciones, roles, docentes, familias, retiro de accesos y claves foráneas. No se conecta a tu proyecto ni crea usuarios reales.

`npm run build` comprueba TypeScript y la compilación de producción.

Después de instalar, prueba con cuentas reales de administrador, docente, apoderado y sin asignación. Verifica también que retirar el vínculo de un apoderado elimina la lectura del estudiante. La aplicación solicita datos con la clave publicable y la sesión del usuario, nunca con service_role.

## Alcance de esta etapa

Incluye creación de aulas y alumnos, búsqueda por DNI/apellidos/nombres, estado activo, gestión de roles y vínculos. El DNI es opcional para permitir registrar estudiantes que aún no disponen de él. El listado se limita a los datos permitidos por RLS; para volúmenes superiores al límite de filas configurado en Supabase será necesario incorporar paginación antes de una carga masiva.

No incluye todavía matrículas históricas entre años, edición de fichas, notas ni reportes escolares de evaluación. Portería ya dispone de su propio historial y carnet QR; ver [su guía](PORTERIA.md). La asistencia por clase y los movimientos de portería serán registros separados. La nota de conducta será de 0 a 20; no se ha programado una fórmula institucional ni sanciones automáticas.

## Actualizar una instalación existente: formato único de importación

Ejecuta solo `migrations/202611050002_unified_student_import.sql`, una vez. No vuelvas a ejecutar la primera migración ni el bootstrap. Esta actualización añade la función transaccional `import_school_students`, que permite crear las aulas faltantes y sus estudiantes a partir del archivo único, sin ampliar los permisos generales de las tablas. La función se limita a administrador, director y auxiliar de la institución indicada.

La plantilla contiene DNI, nombres, apellidos, año, nivel, grado y sección. No necesita seleccionar ni crear previamente las aulas. La vista previa reutiliza aulas equivalentes y anuncia cuáles se crearán. Si existen varias aulas equivalentes, la importación se detiene para que un administrador revise la ambigüedad. No cambia el aula ni la matrícula de estudiantes ya registrados.

`npm run test:import-db` comprueba permisos, reutilización de aulas, creación de múltiples aulas, campos inválidos, DNI repetidos, reintentos y reversión completa del lote ante un fallo de inserción.
