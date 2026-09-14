'use client'

import { useTransition } from 'react'
import type { ApiTokenZeile as Zeile } from '@/einstellungen/aktionen'
import { widerrufeMeinApiToken } from '@/einstellungen/aktionen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis, fehler as alsFehler } from '@/melden/typen'
import { Kreisel } from '@/app/teile/anzeigen'

const STATUS_KLASSE: Record<Zeile['status'], string> = {
  aktiv: 'm-akzent',
  abgelaufen: 'm-warn',
  widerrufen: 'm-entwurf',
}

const STATUS_TEXT: Record<Zeile['status'], string> = {
  aktiv: 'aktiv',
  abgelaufen: 'abgelaufen',
  widerrufen: 'widerrufen',
}

function datum(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('de-DE') : '—'
}

export function ApiTokenZeile({ token }: { token: Zeile }) {
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()

  function widerrufe() {
    if (!window.confirm(`Token „${token.name}" widerrufen? Das lässt sich nicht zurücknehmen.`)) {
      return
    }
    starte(async () => {
      try {
        const meldung = ausErgebnis(await widerrufeMeinApiToken(token.id))
        if (meldung) melde(meldung)
      } catch (ausnahme) {
        melde(alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Nicht widerrufen.'))
      }
    })
  }

  return (
    <div className="karte" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <strong>{token.name}</strong>{' '}
        <span className={`marke-pille ${STATUS_KLASSE[token.status]}`}>
          {STATUS_TEXT[token.status]}
        </span>
        <div className="unterzeile">
          <code>{token.praefix}…</code> · erzeugt {datum(token.erstelltAm)} · läuft ab{' '}
          {token.laeuftAbAm ? datum(token.laeuftAbAm) : 'nie'} · zuletzt verwendet{' '}
          {token.letzteVerwendungAm ? datum(token.letzteVerwendungAm) : 'noch nie'}
        </div>
      </div>

      {token.status !== 'widerrufen' ? (
        <button type="button" className="gefahr" disabled={laeuft} onClick={widerrufe}>
          {laeuft ? <Kreisel /> : 'Widerrufen'}
        </button>
      ) : null}
    </div>
  )
}
