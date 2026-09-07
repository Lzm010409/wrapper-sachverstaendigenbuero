'use client'

import { useState, useTransition } from 'react'
import { aktualisiereFall, type ImportZustand } from '@/autoixpert/aktionen'

export function Aktualisieren({ fallId }: { fallId: string }) {
  const [laeuft, starte] = useTransition()
  const [zustand, setzeZustand] = useState<ImportZustand | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        type="button"
        disabled={laeuft}
        onClick={() => starte(async () => setzeZustand(await aktualisiereFall(fallId)))}
      >
        {laeuft ? 'Lädt …' : 'Aus autoiXpert neu laden'}
      </button>
      {zustand?.fehler ? (
        <span style={{ fontSize: 12.5, color: 'var(--crit)' }} role="alert">
          {zustand.fehler}
        </span>
      ) : null}
      {zustand?.hinweis ? (
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }} role="status">
          {zustand.hinweis}
        </span>
      ) : null}
    </div>
  )
}
