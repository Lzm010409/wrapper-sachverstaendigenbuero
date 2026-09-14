import { verlangeAnmeldung } from '@/auth/wache'
import { meineApiTokens } from '@/einstellungen/aktionen'
import { NeuesApiToken } from './neues-token'
import { ApiTokenZeile } from './token-zeile'

/**
 * Persönliche Einstellungen — vorerst nur die API-Tokens für `/api/v1/*`.
 *
 * Jeder angemeldete Zugang verwaltet hier ausschliesslich seine eigenen
 * Tokens; es braucht dafür kein eigenes Recht, weil ein Token ohnehin nur
 * das kann, was der Zugang selbst kann.
 */
export default async function Einstellungen() {
  await verlangeAnmeldung()
  const tokens = await meineApiTokens()

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Einstellungen</h1>
          <p className="unterzeile">
            API-Tokens für den eigenen Zugang — für Automatisierungen wie n8n oder eigene Skripte.
          </p>
        </div>
      </div>

      <div className="karte" style={{ marginBottom: 16 }}>
        <h2>Neues Token</h2>
        <p className="unterzeile" style={{ marginTop: 0 }}>
          Ein Token trägt dieselben Rechte wie dieser Zugang. Der Klartext wird nach dem Erzeugen
          nur dieses eine Mal angezeigt.
        </p>
        <NeuesApiToken />
      </div>

      <h2>Vorhandene Tokens</h2>
      {tokens.length === 0 ? (
        <p className="unterzeile">Noch kein Token erzeugt.</p>
      ) : (
        <div className="liste">
          {tokens.map((t) => (
            <ApiTokenZeile key={t.id} token={t} />
          ))}
        </div>
      )}

      <div className="hinweis" style={{ marginTop: 16 }}>
        Zugriff über den Kopf <code>Authorization: Bearer &lt;token&gt;</code> auf{' '}
        <code>/api/v1/stellungnahmen</code> und <code>/api/v1/bibliothek</code>.
      </div>
    </>
  )
}
