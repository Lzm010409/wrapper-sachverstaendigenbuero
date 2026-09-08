'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { importiereFall, type ImportZustand } from '@/autoixpert/aktionen'
import { Kreisel } from '@/app/teile/anzeigen'
import { Meldung } from '@/app/teile/meldung'

function Absenden({ aktiv }: { aktiv: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="haupt" disabled={pending || !aktiv}>
      {/* Der Abruf geht über das Netz zu autoiXpert und kann Sekunden
          dauern; ein Knopf, der nur seine Beschriftung wechselt, sieht dabei
          aus wie ein Knopf, der nichts tut. */}
      {pending ? <Kreisel text="Wird geladen …" /> : 'Fall laden'}
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
        <Meldung art="fehler" style={{ marginBottom: 18 }}>
          {zustand.fehler}
        </Meldung>
      ) : null}
      {zustand.hinweis ? (
        <Meldung art="erfolg" style={{ marginBottom: 18 }}>
          {zustand.hinweis}
        </Meldung>
      ) : null}
    </>
  )
}
