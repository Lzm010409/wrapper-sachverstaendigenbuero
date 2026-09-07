const TEXTE: Record<string, string> = {
  entwurf: 'Entwurf',
  pruefung: 'In Prüfung',
  freigegeben: 'Freigegeben',
  zurueckgezogen: 'Zurückgezogen',
}

export function StatusPille({ status }: { status: string }) {
  return <span className={`marke-pille m-${status}`}>{TEXTE[status] ?? status}</span>
}
