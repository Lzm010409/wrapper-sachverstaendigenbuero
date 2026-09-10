/**
 * Attrappe der autoiXpert-Schnittstelle für die lokale Entwicklung.
 *
 *   pnpm exec tsx scripts/aix-attrappe.ts [port]
 *
 * Antwortet wie `externalApi/v1` auf `/reports/{id}` und `/reports`, mit den
 * Beispielgutachten aus `src/autoixpert/fixtures.ts`. Damit lässt sich der
 * Fallimport vollständig durchspielen, solange kein Zugriff auf die echte
 * Schnittstelle besteht.
 */
import { createServer } from 'node:http'
import {
  BEISPIEL_GUTACHTEN,
  GUTACHTEN_MINIMAL,
  GUTACHTEN_OHNE_ANWALT,
} from '../src/autoixpert/fixtures'

const PORT = Number(process.argv[2] ?? 4010)
const GUTACHTEN = [BEISPIEL_GUTACHTEN, GUTACHTEN_OHNE_ANWALT, GUTACHTEN_MINIMAL]

const server = createServer((anfrage, antwort) => {
  const url = new URL(anfrage.url ?? '/', `http://localhost:${PORT}`)
  const sende = (status: number, koerper: unknown) => {
    antwort.writeHead(status, { 'content-type': 'application/json' })
    antwort.end(JSON.stringify(koerper))
  }

  if (!anfrage.headers.authorization?.startsWith('Bearer ')) {
    return sende(401, { error: 'Kein Token' })
  }

  const einzel = url.pathname.match(/^\/externalApi\/v1\/reports\/([^/]+)$/)
  if (einzel) {
    const gesucht = decodeURIComponent(einzel[1]!)
    // Wie die echte Schnittstelle: der Pfad trifft die interne ID und die
    // externe ID — das Aktenzeichen (token) aber ausdrücklich nicht.
    const treffer = GUTACHTEN.find((g) => g.id === gesucht || g.external_id === gesucht)
    return treffer ? sende(200, { report: treffer }) : sende(404, { error: 'Nicht gefunden' })
  }

  if (url.pathname === '/externalApi/v1/reports') {
    const limit = Number(url.searchParams.get('limit') ?? 10)
    const sortiert = [...GUTACHTEN].sort((a, b) => (a.token ?? '').localeCompare(b.token ?? ''))
    return sende(200, { reports: sortiert.slice(0, limit), has_more: false, next_page: null })
  }

  sende(404, { error: 'Unbekannter Pfad' })
})

server.listen(PORT, () => {
  console.log(`  autoiXpert-Attrappe auf http://localhost:${PORT}/externalApi/v1`)
  console.log(`  Aktenzeichen: ${GUTACHTEN.map((g) => g.token ?? '—').join(', ')}`)
  console.log(`  IDs:          ${GUTACHTEN.map((g) => g.id).join(', ')}`)
})
