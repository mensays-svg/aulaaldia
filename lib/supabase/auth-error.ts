type AuthFailure = { code?: string; status?: number; message?: string }

export function authErrorMessage(error: AuthFailure, signup: boolean): string {
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'Se alcanzó el límite de intentos o correos. Espera unos minutos antes de volver a intentarlo.'
  }
  if (error.code === 'weak_password') return 'La contraseña no cumple los requisitos de seguridad. Usa una contraseña más larga y variada.'
  if (error.code === 'email_address_invalid') return 'Introduce una dirección de correo válida.'
  if (error.code === 'email_address_not_authorized') return 'El servicio de correo no permite enviar a esa dirección. El administrador debe revisar la configuración SMTP.'
  if (error.code === 'email_not_confirmed') return 'Confirma tu correo antes de iniciar sesión. Revisa también Spam.'
  if (error.code === 'signup_disabled' || error.code === 'email_provider_disabled') return 'El registro por correo no está habilitado. Contacta con el administrador.'
  // Classify mail failures without exposing the provider's raw response or credentials.
  if (signup && /sending confirmation email|smtp|error sending email/i.test(error.message ?? '')) {
    return 'No se pudo enviar el correo de confirmación. El administrador debe revisar Gmail SMTP y su contraseña de aplicación en Supabase.'
  }
  if (error.status === 0) return 'No se pudo conectar con el servicio de acceso. Inténtalo de nuevo más tarde.'
  if (error.status && error.status >= 500) return 'El servicio de acceso falló. El administrador debe revisar los registros de autenticación en Supabase.'
  return signup
    ? 'No se pudo completar el registro. Si ya tienes una cuenta, prueba a iniciar sesión; si continúa, contacta con el administrador.'
    : 'No se pudo iniciar sesión. Comprueba tus datos y confirma tu correo.'
}
