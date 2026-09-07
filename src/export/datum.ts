/**
 * Datumsangaben zwischen Brief und Eingabefeld.
 *
 * Im Schreiben steht das Datum deutsch: „mit Schreiben vom 01.08.2026". So
 * wird es auch gespeichert — eine Fassung, die erst beim Drucken
 * umgerechnet werden muss, wäre eine Fehlerquelle mehr. Der Datumswähler
 * des Browsers spricht dagegen ISO. Diese beiden Funktionen übersetzen an
 * genau dieser Grenze.
 *
 * Was kein vollständiges Datum ist, gilt als keines: Bruchstücke wie „0"
 * oder „01.08." werden zu einer leeren Angabe. Sie kommen aus der Zeit, als
 * das Feld ein Textfeld war und der Kasten beim Tippen zuklappte.
 */

export function nachIso(deutsch: string): string {
  const t = deutsch.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (t) {
    const tag = Number(t[1])
    const monat = Number(t[2])
    if (tag < 1 || tag > 31 || monat < 1 || monat > 12) return ''
    return `${t[3]}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(deutsch.trim()) ? deutsch.trim() : ''
}

export function nachDeutsch(iso: string): string {
  const t = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return t ? `${t[3]}.${t[2]}.${t[1]}` : ''
}
