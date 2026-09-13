import type { ReiterSchluessel } from './reiterleiste'

/**
 * Der autoiXpert-Reiter, der zum jeweiligen Wrapper-Reiter gehört — als
 * Gegenstück zur Reiterleiste dort. „Stellungnahmen" fehlt absichtlich: die
 * Schreiben hängen an der Fall-Id, nicht an autoiXpert. „Kalkulation" und
 * „Wiederbeschaffungswert" zeigen beide auf „Schadenskalkulation" — beide
 * lesen dieselbe DAT-Datei des Gutachtens. Autoixperts Reiter
 * „Fahrzeugzustand" und „Rechnung" haben keine Entsprechung im Wrapper und
 * bleiben deshalb unverlinkt.
 */
const AUTOIXPERT_REITER: Partial<Record<ReiterSchluessel, string>> = {
  beteiligte: 'Beteiligte',
  fahrzeug: 'Fahrzeug',
  fotos: 'Fotos',
  kalkulation: 'Schadenskalkulation',
  wbw: 'Schadenskalkulation',
  vorgang: 'Druck-und-Versand',
}

/**
 * Baut den Absprung zurück zum passenden Reiter in autoiXpert — oder `null`,
 * wenn entweder die autoiXpert-Id fehlt oder der aktive Reiter keine
 * Entsprechung dort hat.
 */
export function baueAutoixpertLink(
  autoixpertId: string | null | undefined,
  reiter: ReiterSchluessel,
): string | null {
  const axReiter = AUTOIXPERT_REITER[reiter]
  if (!autoixpertId || !axReiter) return null
  return `https://app.autoixpert.de/Gutachten/${encodeURIComponent(autoixpertId)}/${axReiter}`
}

export function AutoixpertKnopf({ href }: { href: string | null }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="knopf">
      autoiXpert öffnen ↗
    </a>
  )
}
