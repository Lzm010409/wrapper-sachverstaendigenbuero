'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { meldeAn, type AnmeldeZustand } from '@/auth/aktionen'

function Absenden() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="haupt" disabled={pending} style={{ justifyContent: 'center' }}>
      {pending ? 'Wird geprüft …' : 'Anmelden'}
    </button>
  )
}

export function AnmeldeFormular() {
  const [zustand, aktion] = useActionState<AnmeldeZustand, FormData>(meldeAn, {})

  return (
    <form action={aktion}>
      <div className="feld">
        <label htmlFor="email">E-Mail-Adresse</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <div className="feld">
        <label htmlFor="passwort">Passwort</label>
        <input
          id="passwort"
          name="passwort"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {zustand.fehler ? (
        <div className="hinweis fehler" role="alert">
          {zustand.fehler}
        </div>
      ) : null}

      <Absenden />
    </form>
  )
}
