import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` wirft beim Import ausserhalb einer Server-Umgebung.
      // Im Test ist genau das der Fall, obwohl der Code dort völlig richtig
      // läuft — deshalb wird das Paket auf eine leere Datei umgebogen.
      'server-only': fileURLToPath(new URL('./src/test/leer.ts', import.meta.url)),
    },
  },
})
