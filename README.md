# Aula al Día

Aplicación Next.js con TypeScript y Supabase Auth para asistencia, comportamiento y reportes escolares.

## Desarrollo

Requiere Node.js 20.9 o superior.

1. Ejecuta `npm ci`.
2. Copia `.env.example` a `.env.local` y completa la URL del proyecto y la clave **publicable** desde Supabase → Project Settings → API. No uses claves secretas ni service_role.
3. En Supabase → Authentication habilita el proveedor Email y la confirmación de correo. Configura Site URL con el origen de la aplicación (en desarrollo, `http://localhost:3000`).
4. En Authentication → Email Templates → Confirm signup, usa este enlace para confirmar la cuenta y crear la sesión en el servidor:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirmar mi correo</a>
   ```

5. Ejecuta `npm run dev`.

`/login` permite registrarse e iniciar sesión; `/dashboard` exige una identidad validada en el servidor. El proxy actualiza las cookies de sesión y la página protegida vuelve a verificar el usuario. El cierre de sesión usa POST. Sin las variables de Supabase, el formulario queda deshabilitado y las rutas protegidas redirigen al login.

## Validación

- `npm run typecheck`
- `npm run build`
- Sin sesión, abrir `/dashboard` debe redirigir a `/login`.
- Con un proyecto configurado: crear una cuenta, confirmar el correo, iniciar sesión, acceder al panel, cerrar sesión y comprobar que el panel vuelve a exigir login. Probar también un enlace de confirmación caducado.

La conexión y los flujos reales de autenticación requieren configurar un proyecto Supabase. Las migraciones escolares y sus políticas RLS se activan siguiendo la guía de base de datos.

Con el servidor arrancado, `node scripts/smoke.mjs` comprueba acceso público, redirección anónima del panel, confirmación inválida y bloqueo del cierre de sesión desde otro origen. Puedes establecer `TEST_BASE_URL` para otro origen local de pruebas.

### Entorno en la nube con proxy

En este entorno usa Node.js 24 y `NODE_USE_ENV_PROXY=1 npm run dev` (o `NODE_USE_ENV_PROXY=1 npm run start` para producción) para que las peticiones de Supabase respeten el proxy HTTPS configurado. No desactives TLS ni elimines las variables del proxy.

## Módulos escolares

El panel incluye aulas, estudiantes, roles y vínculos con docentes y apoderados. Para activarlos en el proyecto Supabase, sigue [la guía de base de datos](supabase/README.md). Hasta instalar la migración y asignar el primer administrador, la app conserva el inicio/cierre de sesión y muestra un aviso de configuración o de cuenta pendiente de vinculación.

### Carga de estudiantes y aulas con formato único

En **Estudiantes → Cargar estudiantes en bloque**, descarga la plantilla única y completa `dni,nombres,apellidos,año,nivel,grado,sección`. Un archivo puede contener estudiantes de distintas aulas, niveles y años. Guárdalo desde Excel como **CSV UTF-8**, con la columna DNI en formato Texto para conservar los ceros iniciales. No se admiten directamente archivos `.xlsx` o `.xls`.

Se aceptan hasta 500 estudiantes y 256 KB por archivo, con separadores de coma, punto y coma o tabulación. Año: cuatro dígitos entre 2000 y 2100. Nivel: Inicial, Primaria o Secundaria. Grado: Inicial 3, 4 o 5 años; Primaria 1–6; Secundaria 1–5. Sección: obligatoria, se convierte a mayúsculas. El aula se identifica por institución + año + nivel + grado + sección. Las formas habituales de grado (1, 1.º, primero) se consideran equivalentes.

El DNI es obligatorio en la carga masiva. Los alumnos sin DNI pueden registrarse individualmente. Los DNI repetidos en el archivo o ya registrados en la institución bloquean la carga; no se trasladan ni reemplazan estudiantes existentes. Para nuevos años de alumnos existentes utiliza Matrículas; no vuelvas a importar sus DNI.

La vista previa lista los estudiantes y distingue aulas existentes de aulas por crear. Antes de confirmar no se guarda nada. La nueva función de base de datos comprueba permisos, DNI y campos otra vez y guarda aulas y estudiantes en una única transacción: si falla un registro, se revierte todo el lote. Un reintento con los mismos DNI no duplica estudiantes. Si se pierde la conexión, comprueba el listado antes de volver a intentarlo.

**Activación necesaria:** si ya instalaste la base escolar, ejecuta únicamente `supabase/migrations/202611050002_unified_student_import.sql` en Supabase SQL Editor. No repitas la primera migración ni el bootstrap. Para una instalación nueva, aplica todas las migraciones en orden y después el bootstrap. La función permite esta importación a administrador, director y auxiliar dentro de su institución; no abre creación de aulas a docentes ni apoderados.

Validación: `npm run test:import`, `npm run test:import-db`, `npm run test:permissions` y `npm run build`. Las pruebas PostgreSQL se ejecutan en PGlite con usuarios simulados; no modifican datos reales.

### Entrada y salida (portería)

Incluye búsqueda por DNI/apellidos/nombres, carnet y lector QR, entradas, salidas de jornada, salidas anticipadas autorizadas, retornos e historial por fecha. El estado se controla por día de Lima, con hora del servidor y prevención de duplicados. Auxiliar, director y administrador pueden marcar; docentes y apoderados consultan solo a sus estudiantes autorizados. Dirección puede definir horarios por aula para clasificar el primer ingreso.

Para activar este módulo, ejecutar únicamente `supabase/migrations/202611050003_gate_attendance.sql`. Consulta la [guía de portería](supabase/PORTERIA.md) para activación, permisos, uso de cámara, horarios y pruebas. El módulo de comportamiento se activa mediante su propia migración.

### Asistencia por clase

Disponible en **Asistencia por clase** para docentes asignados, dirección/administración y consulta de apoderados. Incluye cursos, sesiones con aula y horario, lista fija de estudiantes, presentes/tardanzas/faltas/justificaciones, avances, cierre, reapertura y correcciones con motivo. El apoderado ve solo las filas de sus hijos en sesiones cerradas. La referencia de portería no marca ni justifica automáticamente la asistencia.

Para activar, ejecutar únicamente `supabase/migrations/202611050004_class_attendance.sql`. La [guía de clases](supabase/CLASES.md) explica permisos y el recorrido de prueba. `npm run test:classes` valida el ciclo y los permisos en PostgreSQL embebido. El docente debe tener el rol y el aula asignados antes de crear sesiones.

### Comportamiento

Incluye periodos, rúbricas institucionales, reconocimientos, incidencias, seguimientos y consulta familiar. Los cuatro criterios institucionales y la nota final se consignan en escala de 0 a 20. La nota final la determina el evaluador aplicando la rúbrica; no hay promedio, descuentos ni sanciones automáticas. Publicar exige una rúbrica registrada y evaluación completa con sustento. Las familias no ven borradores ni anotaciones internas.

Para activar, ejecutar únicamente `supabase/migrations/202611050005_behavior.sql`. Véase [la guía de comportamiento](supabase/COMPORTAMIENTO.md) para permisos, límites, publicación y preparación de una prueba. La automatización de la nota final queda pendiente de recibir una regla concreta aprobada por la institución. `npm run test:behavior` prueba el ciclo y la privacidad en PostgreSQL embebido.

### Reportes individuales

**Reportes** reúne asistencia al colegio, clases cerradas, conducta publicada y resúmenes de comportamiento comunicados a la familia por estudiante y periodo. Ofrece una descarga PDF real y una vista imprimible. Los apoderados solo acceden a sus hijos; el auxiliar conserva un alcance de portería y las clases del docente respetan sus asignaciones.

Para activar, ejecutar únicamente `supabase/migrations/202611050006_student_reports.sql`. Consulta [la guía de reportes](supabase/REPORTES.md). `npm run test:reports` valida permisos y contenido en PostgreSQL embebido; `npm run test:report-pdf` valida generación y paginación con datos ficticios. Las fuentes locales y su licencia están en `assets/fonts` y se incluyen en el despliegue mediante `next.config.ts`.

### Reportes generales para dirección

Disponible para Director y Administrador en **Reportes → Reportes generales para dirección**. Filtra año, periodo, nivel, grado, sección y estudiantes activos/inactivos. Con la migración 008 incluye resúmenes por aula del periodo, pendientes de cierre, asistencia y conducta publicada, además de detalle por estudiante y PDF institucional horizontal.

Para activar, ejecutar únicamente `supabase/migrations/202611050007_management_reports.sql`. Consulta [la guía de dirección](supabase/DIRECCION.md), y activa la migración 008 para conservar las aulas del periodo mediante matrículas históricas. Las notas pendientes no se convierten en cero ni modifican el promedio; el promedio descriptivo no cambia ninguna evaluación.

Pruebas: `npm run test:management-reports`, `npm run test:management-pdf`, `npm run test:report-pdf` y `npm run build`.

### Matrículas por año e historial

**Matrículas** permite a Director y Administrador preparar el siguiente año, activar la matrícula en su año, cambiar aula/sección, registrar retiros y reingresos. Conserva el mismo estudiante, DNI, vínculos familiares, QR y registros educativos. La preparación por aula admite vista previa y hasta 500 estudiantes en una transacción; requiere autorización institucional y no decide promociones automáticamente.

Si ya instalaste las siete migraciones anteriores, ejecuta **solo** `supabase/migrations/202611050008_enrollment_history.sql`. No repitas scripts anteriores. Lee [la guía de matrículas](supabase/MATRICULAS.md) para el recorrido de prueba, los permisos y las limitaciones del padrón inicial. Pruebas: `npm run test:enrollments`, `npm run test:report-pdf`, `npm run test:management-pdf` y `npm run build`.

### Recuperar y cambiar contraseña

En `/login` aparece **¿Olvidaste tu contraseña?** y en el panel **Cambiar contraseña**. La recuperación verifica un enlace de un solo uso al pulsar Continuar y permite establecer la nueva contraseña, incluso sin vínculo escolar. El cambio exige sesión validada en el servidor y confirmación de contraseña; al guardar, solicita cerrar sesiones y vuelve al login.

**Configuración necesaria:** guardar el enlace de recuperación en la plantilla Supabase **Emails → Reset password**, siguiendo [la guía de recuperación](supabase/RECUPERAR_ACCESO.md). No requiere SQL. Pruebas: `npm run test:password` (auth simulada, sin correo real), `npm run build` y recorrido real de correo documentado.

### Panel por rol y diseño adaptable

El panel comparte un menú lateral en escritorio y un menú desplegable en móvil. Los accesos iniciales se adaptan a los roles de la institución seleccionada: Administración prioriza personas y vínculos; Dirección, sus reportes generales; Auxiliar, entrada/salida; Docente, asistencia por clase; Apoderado, reportes de sus estudiantes. Las cuentas con varios roles reúnen los accesos correspondientes. El menú conserva la institución al navegar y la tabla ofrece acceso directo al reporte individual.

La apariencia usa fuentes del sistema, iconos SVG locales, formularios con foco visible y tablas con desplazamiento horizontal. El menú y la cabecera de la app se excluyen de la impresión. No cambia los permisos RLS ni requiere SQL. `npm run test:navigation` valida la selección de accesos por rol, las cuentas con varios roles y los enlaces de institución; las comprobaciones de permisos siguen disponibles en `npm run test:permissions`.

El inicio del panel incluye **Reportes PDF**: elegir periodo y estudiante para descargar directamente el reporte individual. Director y Administrador también descargan el reporte general de toda la institución, con el año del periodo seleccionado. Desde la misma sección se puede abrir la vista previa o los filtros de dirección. Las descargas conservan la autenticación y los permisos existentes; no requieren SQL adicional.

### Gráficas y estadísticas en reportes

Los reportes individuales y generales incluyen tarjetas de indicadores y gráficas de puntualidad, asistencia a clases y comportamiento publicado. En pantalla, cada categoría se puede seleccionar con ratón, tacto o teclado para ampliar sus datos; el selector **Gráficas / Datos** permite consultar las cifras en tabla. Los PDF descargados desde el panel incorporan las mismas estadísticas y gráficas vectoriales, más un enlace a la versión web protegida para usar la interacción. El PDF conserva contenido estático compatible con lectores habituales; no incorpora JavaScript ni enlaces públicos a datos escolares.

Los porcentajes indican su base. Puntualidad a tiempo excluye los ingresos sin horario de su denominador; las distribuciones muestran todos los estados disponibles. No se deducen faltas de días sin marcación ni se convierten notas sin publicar en cero. Los promedios describen evaluaciones publicadas y no modifican las notas. Las gráficas respetan los permisos existentes y no requieren SQL adicional. Validación: `npm run test:report-pdf`, `npm run test:management-pdf`, `npm run build`.

La vista web de reportes agrupa el detalle en desplegables con conteos y controles **Abrir todo / Cerrar todo**. Las secciones vacías se reúnen en un bloque y las gráficas sin datos se sustituyen por un aviso compacto. Al consultar un reporte, sus filtros quedan plegados para dar prioridad al resultado. La impresión abre todo el detalle y después restaura su estado; el PDF descargable conserva su contenido completo.

El PDF usa una ficha visual con cabecera institucional, tarjetas de indicadores, gráficas circulares para distribuciones de asistencia y barras de comportamiento. Las gráficas sin datos se reemplazan por un aviso; el caso individual sin registros de prueba cabe en una página y conserva las aclaraciones. Cuando hay registros, el detalle completo queda en un anexo con tablas y enlaces internos **Ver detalle / Volver al resumen**. El botón **Explorar reporte interactivo** abre la versión web protegida. Las gráficas del archivo PDF son estáticas; la navegación y el enlace sí son clicables.

### Menos pasos en las tareas diarias

- Asistencia: después de revisar las marcas, **Guardar y publicar asistencia** guarda y cierra en una acción. **Guardar borrador** sigue disponible. Se conserva el motivo obligatorio al corregir marcas, las justificaciones y el control de revisión. Si guardar funciona pero publicar falla, se informa que quedó un borrador; no se publica una revisión posterior de otro editor.
- Preparación de clase: un aula, curso o docente asignado se selecciona automáticamente cuando es la única opción disponible. Al crear la sesión se abre directamente su registro de asistencia.
- Reportes: **Descargar PDF** está en la fila del estudiante y utiliza el periodo vigente por defecto. Si solo hay un estudiante disponible según los permisos, se selecciona automáticamente en las descargas y al abrir Reportes sin una búsqueda.
- Portería: después de confirmar un movimiento, el cursor regresa al campo de búsqueda y selecciona su texto para escribir el próximo DNI. La observación opcional queda plegada. Identidad, autorización y confirmación de cada movimiento se conservan.

No requiere SQL adicional. Validación del guardado/publicación con cambios simultáneos: `npm run test:quick-attendance`; permisos y ciclo de clases: `npm run test:classes`.
