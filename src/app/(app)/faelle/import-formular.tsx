'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { importiereFall, type ImportZustand } from '@/autoixpert/aktionen'

function Absenden({ aktiv }: { aktiv: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="haupt" disabled={pending || !aktiv}>
      {pending ? 'Wird geladen …' : 'Fall laden'}
    </button>
  )
}

export function ImportFormular({ aktiv }: { aktiv: boolean }) {
  const router = useRouter()
  const [zustand, aktion] = useActionState<ImportZustand, FormData>(importiereFall, {})

  useEffect(() => {
    if (zustand.fallId) router.push(`/faelle/${zustand.fallId}`)
  }, [zustand.fallId, router])

  return (
    <>
      <form action={aktion} className="werkzeugleiste" style={{ marginBottom: 12 }}>
        <input
          type="search"
          name="eingabe"
          placeholder="Aktenzeichen, technische ID oder externe ID"
          aria-label="Aktenzeichen oder ID"
          required
          disabled={!aktiv}
        />
        <Absenden aktiv={aktiv} />
        <span className="treffer-zahl">
          Aktenzeichen brauchen eine Suche, IDs laden direkt
        </span>
      </form>

      {zustand.fehler ? (
        <div className="hinweis fehler" style={{ marginBottom: 18 }} role="alert">
          {zustand.fehler}
        </div>
      ) : null}
      {zustand.hinweis ? (
        <div className="hinweis" style={{ marginBottom: 18 }} role="status">
          {zustand.hinweis}
        </div>
      ) : null}
    </>
  )
}
