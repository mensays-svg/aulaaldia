import type { NextConfig } from 'next'
const config: NextConfig = {
  outputFileTracingIncludes: {
    '/dashboard/reportes/pdf': ['./assets/fonts/**/*'],
  },
}
export default config
