export function validRecoveryToken(token: string): boolean {
  // Supabase uses SHA-224 (56 hex characters), with an optional PKCE prefix.
  // Treat the token as opaque; Supabase verifies its authenticity and expiration.
  return /^[A-Za-z0-9_-]{32,256}$/.test(token)
}
export function passwordValidation(password: string, confirmation: string): string | null {
  if (password.length < 8 || password.length > 128) return 'Usa una contraseña de 8 a 128 caracteres.'
  if (password !== confirmation) return 'Las contraseñas no coinciden.'
  return null
}
export function passwordError(error: { code?: string; status?: number }): string {
  if (error.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error.code ?? '')) return 'Se alcanzó el límite de intentos. Espera unos minutos antes de volver a intentarlo.'
  if (error.code === 'same_password') return 'Elige una contraseña distinta de la anterior.'
  if (error.code === 'weak_password') return 'La contraseña no cumple los requisitos de seguridad. Usa una más larga y variada.'
  if (['reauthentication_needed', 'reauthentication_not_valid', 'session_not_found', 'refresh_token_not_found'].includes(error.code ?? '')) return 'La sesión requiere verificación. Solicita un nuevo enlace de recuperación e inténtalo desde ese enlace.'
  return 'No se pudo completar la operación. Inténtalo más tarde; si continúa, contacta con el administrador.'
}
