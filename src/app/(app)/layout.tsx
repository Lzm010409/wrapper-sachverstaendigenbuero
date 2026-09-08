import Link from 'next/link'
import { redirect } from 'next/navigation'
import { aktuellerBenutzer } from '@/auth/sitzung'
import { meldeAb } from '@/auth/aktionen'
import { Kopfleiste } from '@/app/teile/kopfleiste'
import { Menuepunkte } from '@/app/teile/menue'
import { Melder } from '@/app/teile/melder'

const ROLLENNAMEN: Record<string, string> = {
  ersteller: 'Ersteller',
  freigeber: 'Freigeber',
  admin: 'Administration',
}

/** Anfangsbuchstaben für das Namenszeichen in der Kopfleiste. */
function initialen(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((teil) => teil[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Der Rahmen der Anwendung nach dem Vorbild autoiXpert: eine schmale Leiste
 * mit Piktogrammen links, darüber eine flache Kopfleiste, daneben der Inhalt.
 *
 * Vorher standen hier zwei Spalten — eine dunkle Zierschiene und ein Menü
 * von 250px. Beide sind zu einer 56px breiten Leiste zusammengefallen; die
 * gewonnene Breite gehört jetzt dem Inhalt, und der Wechsel aus autoiXpert
 * fühlt sich nicht mehr wie ein Wechsel an.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const benutzer = await aktuellerBenutzer()
  if (!benutzer) redirect('/anmelden')

  return (
    <Melder>
      <div className="schiene">
        <Link href="/faelle" className="schiene-zeichen" aria-label="Zur Fallübersicht">
          ✕
        </Link>

        {/* `display: contents` reicht die Verweise als Kinder der Schiene
            durch — die Auszeichnung als Navigation bleibt trotzdem stehen. */}
        <nav className="menue" aria-label="Hauptmenü">
          <Menuepunkte />
        </nav>
      </div>

      <div className="huelle">
        <Kopfleiste
          rechts={
            <>
              <span className="benutzer-zeichen" title={ROLLENNAMEN[benutzer.rolle] ?? benutzer.rolle}>
                {initialen(benutzer.name)}
              </span>
              <span className="benutzer-name">{benutzer.name}</span>
              <form action={meldeAb}>
                <button type="submit" className="knopf-schlicht">
                  Abmelden
                </button>
              </form>
            </>
          }
        />
        <main>{children}</main>
      </div>
    </Melder>
  )
}
