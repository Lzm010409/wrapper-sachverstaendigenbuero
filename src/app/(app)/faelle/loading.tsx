import { SkelettListe } from '@/app/teile/skelett'

/**
 * Was Next zeigt, solange die Seite auf dem Server noch arbeitet.
 *
 * Vorher gab es im ganzen Projekt keine einzige `loading.tsx`. Beim Klick auf
 * einen Listeneintrag blieb die alte Seite stehen, bis die neue fertig war —
 * bei einer Datenbankabfrage kaum zu merken, beim Fall mit Netzabruf sehr
 * wohl. Der Klick sah aus, als wäre er ins Leere gegangen.
 */
export default function Laedt() {
  return <SkelettListe />
}
