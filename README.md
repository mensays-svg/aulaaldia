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

La conexión y los flujos reales de autenticación requieren configurar un proyecto Supabase. No se han creado tablas ni políticas de datos: al añadir datos escolares, habilita RLS y define políticas antes de exponerlos al cliente.

Con el servidor arrancado, `node scripts/smoke.mjs` comprueba acceso público, redirección anónima del panel, confirmación inválida y bloqueo del cierre de sesión desde otro origen. Puedes establecer `TEST_BASE_URL` para otro origen local de pruebas.

### Entorno en la nube con proxy

En este entorno usa Node.js 24 y `NODE_USE_ENV_PROXY=1 npm run dev` (o `NODE_USE_ENV_PROXY=1 npm run start` para producción) para que las peticiones de Supabase respeten el proxy HTTPS configurado. No desactives TLS ni elimines las variables del proxy.

## Módulos escolares

El panel incluye aulas, estudiantes, roles y vínculos con docentes y apoderados. Para activarlos en el proyecto Supabase, sigue [la guía de base de datos](supabase/README.md). Hasta instalar la migración y asignar el primer administrador, la app conserva el inicio/cierre de sesión y muestra un aviso de configuración o de cuenta pendiente de vinculación.

### Carga de estudiantes y aulas con formato único

En **Estudiantes → Cargar estudiantes en bloque**, descarga la plantilla única y completa `dni,nombres,apellidos,año,nivel,grado,sección`. Un archivo puede contener estudiantes de distintas aulas, niveles y años. Guárdalo desde Excel como **CSV UTF-8**, con la columna DNI en formato Texto para conservar los ceros iniciales. No se admiten directamente archivos `.xlsx` o `.xls`.

Se aceptan hasta 500 estudiantes y 256 KB por archivo, con separadores de coma, punto y coma o tabulación. Año: cuatro dígitos entre 2000 y 2100. Nivel: Inicial, Primaria o Secundaria. Grado: Inicial 3, 4 o 5 años; Primaria 1–6; Secundaria 1–5. Sección: obligatoria, se convierte a mayúsculas. El aula se identifica por institución + año + nivel + grado + sección. Las formas habituales de grado (1, 1.º, primero) se consideran equivalentes.

El DNI es obligatorio en la carga masiva. Los alumnos sin DNI pueden registrarse individualmente. Los DNI repetidos en el archivo o ya registrados en la institución bloquean la carga; no se trasladan ni reemplazan estudiantes existentes. Para nuevas matrículas de alumnos existentes se necesitará el futuro módulo de matrícula histórica.

La vista previa lista los estudiantes y distingue aulas existentes de aulas por crear. Antes de confirmar no se guarda nada. La nueva función de base de datos comprueba permisos, DNI y campos otra vez y guarda aulas y estudiantes en una única transacción: si falla un registro, se revierte todo el lote. Un reintento con los mismos DNI no duplica estudiantes. Si se pierde la conexión, comprueba el listado antes de volver a intentarlo.

**Activación necesaria:** si ya instalaste la base escolar, ejecuta únicamente `supabase/migrations/202611050002_unified_student_import.sql` en Supabase SQL Editor. No repitas la primera migración ni el bootstrap. Para una instalación nueva, aplica las dos migraciones en orden y después el bootstrap. La función permite esta importación a administrador, director y auxiliar dentro de su institución; no abre creación de aulas a docentes ni apoderados.

Validación: `npm run test:import`, `npm run test:import-db`, `npm run test:permissions` y `npm run build`. Las pruebas PostgreSQL se ejecutan en PGlite con usuarios simulados; no modifican datos reales.
