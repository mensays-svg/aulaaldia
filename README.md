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
