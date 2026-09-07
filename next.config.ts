import type { NextConfig } from 'next'

const config: NextConfig = {
  // Standalone-Ausgabe hält das Container-Image klein (siehe Dockerfile).
  output: 'standalone',
  experimental: {
    // Server Actions bekommen größere Uploads: Prüfberichte sind oft
    // gescannte PDFs jenseits des Standardlimits von 1 MB.
    serverActions: { bodySizeLimit: '25mb' },
  },
}

export default config
