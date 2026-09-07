import { redirect } from 'next/navigation'
import Link from 'next/link'
import { aktuellerBenutzer } from '@/auth/sitzung'
import { meldeAb } from '@/auth/aktionen'
import { Kopfleiste } from '@/app/teile/kopfleiste'
import { Menuepunkte } from '@/app/teile/menue'

const ROLLENNAMEN: Record<string, string> = {
  ersteller: 'Ersteller',
  freigeber: 'Freigeber',
  admin: 'Administration',
}

/**
 * Der Rahmen der Anwendung nach der Vorlage: schmale Schiene, Menü,
 * Kopfleiste, Inhalt.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const benutzer = await aktuellerBenutzer()
  if (!benutzer) redirect('/anmelden')

  return (
    <>
      <div className="schiene" aria-hidden="true">
        <span>Gollenstede Sachverstand</span>
      </div>

      <nav className="menue" aria-label="Hauptmenü">
        <Link href="/stellungnahmen" className="marke">
          Werkbank
        </Link>

        <p className="menue-titel">Arbeit</p>
        <Menuepunkte />

        <div className="menue-fuss">
          <span className="menue-benutzer">{benutzer.name}</span>
          <span>{ROLLENNAMEN[benutzer.rolle] ?? benutzer.rolle}</span>
          <form action={meldeAb}>
            <button type="submit" style={{ width: '100%', justifyContent: 'center' }}>
              Abmelden
            </button>
          </form>
        </div>
      </nav>

      <div className="huelle">
        <Kopfleiste />
        <main>{children}</main>
      </div>
    </>
  )
}
