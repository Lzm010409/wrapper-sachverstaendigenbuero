import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME } from '@/auth/sitzung-name'

/**
 * Der äussere Riegel: wer gar kein Sitzungscookie mitbringt, kommt an die
 * geschützten Seiten nicht heran — die Anfrage wird umgeleitet, **bevor**
 * überhaupt gerendert wird.
 *
 * Das ist bewusst nur eine Vorprüfung auf das Vorhandensein des Cookies.
 * Middleware läuft in einer eigenen Laufzeit ohne Datenbankzugriff; ob das
 * Cookie gültig ist, kann sie nicht wissen. Diese Prüfung macht die Seite
 * selbst (`verlangeAnmeldung`), und die ist der eigentliche Schutz.
 *
 * Zusammen: die Middleware wehrt den Abruf ohne Cookie ab — genau den Fall,
 * mit dem sich am 07.09.2026 die Fallliste im Rumpf einer 307-Antwort
 * auslesen liess. Die Prüfung in der Seite wehrt alles Übrige ab.
 */
const GESCHUETZT = ['/faelle', '/stellungnahmen', '/bibliothek', '/bilder', '/verwaltung']

export function middleware(anfrage: NextRequest) {
  const pfad = anfrage.nextUrl.pathname
  if (!GESCHUETZT.some((p) => pfad === p || pfad.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  if (anfrage.cookies.get(COOKIE_NAME)?.value) return NextResponse.next()

  const ziel = new URL('/anmelden', anfrage.url)
  return NextResponse.redirect(ziel)
}

export const config = {
  matcher: [
    '/faelle/:path*',
    '/stellungnahmen/:path*',
    '/bibliothek/:path*',
    '/bilder/:path*',
    // Die Verwaltung führt Namen und E-Mail-Adressen aller Zugänge — sie
    // gehört genauso hinter den äusseren Riegel wie die Fallliste.
    '/verwaltung/:path*',
  ],
}
