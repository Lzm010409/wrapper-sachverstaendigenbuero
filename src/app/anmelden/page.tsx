import { redirect } from 'next/navigation'
import { aktuellerBenutzer } from '@/auth/sitzung'
import { istEntraAktiv } from '@/auth/entra'
import { AnmeldeFormular } from './formular'
import { STARTSEITE } from '@/auth/startseite'

const FEHLERTEXTE: Record<string, string> = {
  'kein-konto':
    'Für dieses Microsoft-Konto ist hier noch kein Zugang eingerichtet. Bitte an die Büroverwaltung wenden.',
  'konto-gesperrt': 'Dieser Zugang ist deaktiviert.',
  'entra-nicht-konfiguriert': 'Die Microsoft-Anmeldung ist auf diesem Server nicht eingerichtet.',
  'entra-sitzung-abgelaufen': 'Der Anmeldevorgang hat zu lange gedauert. Bitte erneut versuchen.',
  'entra-state-ungueltig': 'Der Anmeldevorgang konnte nicht zugeordnet werden. Bitte erneut versuchen.',
  'entra-pruefung-fehlgeschlagen': 'Die Antwort von Microsoft konnte nicht bestätigt werden.',
  'entra-abbruch': 'Die Anmeldung bei Microsoft wurde abgebrochen.',
  access_denied: 'Microsoft hat die Anmeldung abgelehnt.',
}

export default async function AnmeldeSeite({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>
}) {
  if (await aktuellerBenutzer()) redirect(STARTSEITE)

  const { fehler } = await searchParams
  const meldung = fehler ? (FEHLERTEXTE[fehler] ?? 'Die Anmeldung ist fehlgeschlagen.') : null

  return (
    <div className="anmelde-huelle">
      <div className="anmelde-karte">
        <p className="marke" style={{ marginBottom: 12 }}>
          Kürzungsabwehr-Werkbank
        </p>
        <h1 style={{ fontSize: 19 }}>Anmelden</h1>
        <p className="unterzeile">Sachverständigenbüro Gollenstede</p>

        {meldung ? (
          <div className="hinweis fehler" style={{ marginTop: 18 }} role="alert">
            {meldung}
          </div>
        ) : null}

        {istEntraAktiv() ? (
          <>
            <a
              className="knopf haupt"
              href="/api/auth/entra/start"
              style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
            >
              <MicrosoftLogo />
              Mit Microsoft anmelden
            </a>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                margin: '20px 0 0',
                color: 'var(--ink-soft)',
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              oder mit Passwort
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
          </>
        ) : null}

        <AnmeldeFormular />
      </div>
    </div>
  )
}

function MicrosoftLogo() {
  return (
    <svg width="15" height="15" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  )
}
