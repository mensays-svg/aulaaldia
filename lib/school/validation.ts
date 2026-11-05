export function validDni(value: string): boolean { return value === '' || /^\d{8}$/.test(value) }
export function validUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) }
export const schoolRoles = ['administrador', 'director', 'auxiliar', 'docente', 'apoderado'] as const
