import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    /*
      Eine Adresse, die nie angewaehlt wird.

      `src/db/index.ts` wirft beim Import, wenn `DATABASE_URL` fehlt — richtig
      im Betrieb, im Test aber ein Stolperdraht: sobald eine Client-Komponente
      eine Serveraktion importiert, haengt die Datenbank mit im Importbaum und
      der Test scheitert, bevor er beginnt. `postgres` baut die Verbindung
      erst beim ersten Aufruf auf; hier wird keiner gemacht.
    */
    env: { DATABASE_URL: 'postgres://test@127.0.0.1:1/test' },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
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
