import { zuAbsaetzen } from '@/autoixpert/reichtext'

/**
 * Gibt ein Freitextfeld aus autoiXpert lesbar aus.
 *
 * Die Felder kommen als HTML (`<p>`, `-&gt;`, gelegentlich Listen). Vorher
 * standen die Marken wörtlich auf dem Schirm. Hier entstehen ausschliesslich
 * Textknoten und `<strong>`/`<em>` — fremder Inhalt kann also nicht zu
 * Markup werden.
 */
export function Reichtext({
  wert,
  klasse = 'fliesstext',
}: {
  wert: string | null | undefined
  klasse?: string
}) {
  const absaetze = zuAbsaetzen(wert)
  if (absaetze.length === 0) return null

  return (
    <div className={klasse}>
      {absaetze.map((absatz, i) => (
        <p
          key={i}
          style={{
            margin: i === 0 ? '0 0 6px' : '0 0 6px',
            // Ein Listenpunkt rückt ein und bekommt sein Zeichen; die
            // Absatzfolge bleibt dieselbe, damit nichts springt.
            paddingLeft: absatz.art === 'punkt' ? 16 : 0,
            textIndent: absatz.art === 'punkt' ? -10 : 0,
          }}
        >
          {absatz.art === 'punkt' ? '• ' : null}
          {absatz.teile.map((teil, j) => {
            if (teil.fett) return <strong key={j}>{teil.text}</strong>
            if (teil.kursiv) return <em key={j}>{teil.text}</em>
            return <span key={j}>{teil.text}</span>
          })}
        </p>
      ))}
    </div>
  )
}
