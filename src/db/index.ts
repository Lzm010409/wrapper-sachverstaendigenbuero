import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error(
    'DATABASE_URL fehlt. In der lokalen Entwicklung .env.local anlegen, ' +
      'in Coolify als Umgebungsvariable hinterlegen.',
  )
}

// Im Entwicklungsmodus lädt Next Module bei jeder Änderung neu. Ohne diesen
// Zwischenspeicher entstünde bei jedem Reload ein neuer Verbindungspool.
const globalForDb = globalThis as unknown as { __sql?: postgres.Sql }

const client = globalForDb.__sql ?? postgres(url, { max: 10 })
if (process.env.NODE_ENV !== 'production') globalForDb.__sql = client

export const db = drizzle(client, { schema, casing: 'snake_case' })
export { schema }
