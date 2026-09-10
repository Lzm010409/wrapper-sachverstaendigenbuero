import type { NextConfig } from 'next'

const config: NextConfig = {
  // Standalone-Ausgabe hält das Container-Image klein (siehe Dockerfile).
  output: 'standalone',

  /*
   * Was NICHT ins Laufzeit-Abbild gehört.
   *
   * `src/export/docx.ts` liest die Geschäftspapier-Vorlage über einen zur
   * Bauzeit unbekannten Pfad (`process.cwd()` plus Variable). Next kann
   * daraus nicht schliessen, welche Datei gemeint ist, und nimmt zur
   * Sicherheit **das ganze Projektverzeichnis** in die Standalone-Ausgabe
   * auf — gemessen 64 MB, davon 17 MB abgelegte API-Dokumentation als
   * MHTML, dazu docs/, src/ und der Lockfile.
   *
   * Nichts davon wird zur Laufzeit gebraucht: die Vorlage liegt unter
   * `skills/`, und die kopiert der Dockerfile ohnehin ausdrücklich.
   * Migrationen und Startbefüllung ebenso.
   */
  outputFileTracingExcludes: {
    '*': [
      'Autoixpert API/**',
      'docs/**',
      'src/**',
      'tests/**',
      'drizzle/**',
      '.next/cache/**',
      '**/*.mhtml',
      '**/*.tsbuildinfo',
      'pnpm-lock.yaml',
    ],
  },
  experimental: {
    // Server Actions bekommen größere Uploads: Prüfberichte sind oft
    // gescannte PDFs jenseits des Standardlimits von 1 MB.
    serverActions: { bodySizeLimit: '25mb' },
  },
}

export default config
