/**
 * Die Ablaufoptionen eines API-Tokens — ohne `server-only`, damit das
 * Anlegeformular sie im Browser mitbenutzen kann. Dieselbe Trennung wie bei
 * `Bereich` in `src/bibliothek/eingabe.ts`: ein Wert aus einem
 * `server-only`-Modul zieht sonst dessen ganzen Importbaum (hier: die
 * Datenbank) ins Browserpaket.
 */
export type ApiTokenAblauf = '90-tage' | '1-jahr' | 'nie'

export const API_TOKEN_ABLAEUFE: { wert: ApiTokenAblauf; text: string }[] = [
  { wert: '90-tage', text: 'in 90 Tagen' },
  { wert: '1-jahr', text: 'in 1 Jahr' },
  { wert: 'nie', text: 'nie' },
]
