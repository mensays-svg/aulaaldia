# Recuperación y cambio de contraseña

No requiere migraciones SQL ni cambios de roles, matrículas o datos escolares.

## Configuración en Supabase

1. Authentication → URL Configuration: Site URL debe ser `https://aulaaldia.vercel.app` (sin rutas). Para desarrollo usar el origen local en un proyecto de pruebas.
2. Authentication → Emails → Templates → **Reset password** (Restablecer contraseña). Con SMTP personalizado habilitado, editar el cuerpo/Source y guardar este enlace:

```html
<h2>Recupera tu acceso a Aula al Día</h2>
<p>Si solicitaste cambiar tu contraseña, continúa desde este enlace:</p>
<p><a href="{{ .SiteURL }}/recuperar/confirmar?token_hash={{ .TokenHash }}">Cambiar mi contraseña</a></p>
<p>Si no lo solicitaste, puedes ignorar este correo.</p>
```

No reemplazar la plantilla Confirm signup: sigue usando su enlace `/auth/confirm?...&type=email`. La plantilla de recuperación es distinta. No pegar claves ni contraseñas SMTP en plantillas ni código. Supabase controla la caducidad y el uso único del token.

## Recorrido de prueba real

1. En `/login`, pulsar **¿Olvidaste tu contraseña?**. Escribir el correo de una cuenta de prueba existente.
2. El mensaje no confirma si la cuenta existe. Revisar la bandeja y Spam.
3. Abrir el enlace. La página pide **Continuar y cambiar contraseña** antes de verificar el token; cargar una vista previa no consume el enlace. La verificación crea una sesión de Supabase y abre `/dashboard/seguridad` sin exigir vínculo escolar.
4. Escribir dos veces una contraseña nueva (8–128 caracteres, además de la política del proyecto). No se recortan espacios de las contraseñas. Al guardar se actualiza la cuenta y se solicita el cierre global de las sesiones de actualización; los access tokens ya emitidos vencen según la configuración de Supabase.
5. Iniciar sesión con la nueva contraseña; comprobar que la anterior ya no funciona. No cambian roles ni vínculos.
6. Probar un enlace usado o caducado: debe invitar a solicitar uno nuevo. Usar el correo más reciente. Probar contraseñas diferentes, corta y reutilizada.
7. Con sesión iniciada, **Cambiar contraseña** está disponible en el panel, incluso para una cuenta pendiente de vinculación. La página y la operación verifican la identidad en el servidor. Si Supabase exige reautenticación, solicitar un nuevo enlace de recuperación.

El envío depende del SMTP ya configurado y de los límites de correo de Supabase/Gmail. No hace falta volver a publicar al guardar la plantilla. La app no cambia la configuración de Supabase por sí sola.

## Validación automatizada

`npm run test:password` ejecuta las Server Actions reales con un adaptador de autenticación simulado: entradas inválidas, privacidad de cuentas inexistentes, límites, fallos de correo, token inválido/caducado, sesión obligatoria, cambio y cierre global. No envía correos ni cambia contraseñas reales. `npm run build` compila las rutas; el recorrido anterior valida la entrega real del correo en tu proyecto.
