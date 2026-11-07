import type { NextConfig } from 'next'
const config: NextConfig = {
  outputFileTracingIncludes: {
    '/dashboard/reportes/docente/pdf': ['./assets/fonts/**/*'],
    '/dashboard/porteria/salones/pdf': ['./assets/fonts/**/*'],
    '/dashboard/reportes/pdf': ['./assets/fonts/**/*'],
    '/dashboard/reportes/direccion/pdf': ['./assets/fonts/**/*'],
  },
}
export default config
