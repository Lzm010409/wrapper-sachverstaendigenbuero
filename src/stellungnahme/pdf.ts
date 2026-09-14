import 'server-only'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { druckeHtml } from '@/wbw/drucker'
import { deutschesDatum, type Absatz, type Kopfdaten } from '@/export/hausstil'

/**
 * Rendert eine Stellungnahme als PDF — für die API, die dritte Ausgabeform
 * neben Word und Klartext.
 *
 * Anders als beim Word-Export (`src/export/docx.ts`) gibt es hier keine
 * Geschäftspapier-Vorlage zu füllen: eine einfache, selbst gebaute
 * HTML-Seite im Hausstil (Serifenschrift, siehe ARCHITEKTUR.md) wird mit
 * demselben Chromium-Drucker gerendert wie die WBW-Belege
 * (`src/wbw/drucker.ts`) — inklusive derselben Schutzriegel: eine fehlende
 * oder zu kleine Vorlage gilt als Fehlschlag, nicht als leeres PDF.
 */

/** Bildbytes, wie sie `ladeBilder` liefert — nur die Felder, die die Vorlage braucht. */
export interface PdfBild {
  daten: Uint8Array
  mimetyp: string
}

function maskiere(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Zeilenumbrüche innerhalb eines Absatzes bleiben erhalten, ohne `pre-wrap` auf die ganze Seite zu legen. */
function alsHtmlZeilen(text: string): string {
  return maskiere(text).replace(/\n/g, '<br>')
}

function absatzHtml(a: Absatz, bilder: Map<string, PdfBild>): string {
  if (a.art === 'leer') return '<p class="leer"></p>'

  if (a.art === 'bild') {
    const b = a.bild
    const inhalt = b ? bilder.get(b.bildId) : undefined
    // Fehlt das Bild, bleibt der Klartextmarker stehen — derselbe Grundsatz
    // wie im Word-Export: ein sichtbarer Hinweis statt einer stillen Lücke.
    if (!b || !inhalt) return `<p class="bildmarker"><em>${maskiere(a.text)}</em></p>`
    const adresse = `data:${inhalt.mimetyp};base64,${Buffer.from(inhalt.daten).toString('base64')}`
    return (
      `<p class="bild"><img src="${adresse}" alt="${maskiere(b.dateiname)}" ` +
      `style="width:${Math.round(b.breite * 100)}%"></p>`
    )
  }

  if (a.art === 'bildunterschrift') return `<p class="bildunterschrift">${alsHtmlZeilen(a.text)}</p>`

  const klasse =
    a.art === 'betreff'
      ? 'betreff'
      : a.art === 'ueberschrift'
        ? 'ueberschrift'
        : a.art === 'signatur'
          ? 'signatur'
          : a.art === 'anrede'
            ? 'anrede'
            : 'text'
  return `<p class="${klasse}">${alsHtmlZeilen(a.text)}</p>`
}

/** Baut die HTML-Seite. Eigenständig testbar, ohne dass dafür gedruckt werden muss. */
export function baueBriefHtml(kopf: Kopfdaten, absaetze: Absatz[], bilder: Map<string, PdfBild>): string {
  const anschrift = [kopf.empfaengerStrasse, kopf.empfaengerPlzOrt]
    .filter((z): z is string => Boolean(z))
    .map(maskiere)
    .join('<br>')

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Stellungnahme</title>
<style>
  @page { margin: 25mm 20mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.4; color: #111; }
  p { margin: 0 0 2pt 0; }
  .kopfdatum { text-align: right; margin-bottom: 18pt; }
  .empfaenger { margin-bottom: 18pt; }
  .betreff, .ueberschrift, .signatur { font-weight: bold; }
  .leer { height: 1em; margin: 0; }
  .bild { text-align: center; }
  .bild img { max-width: 100%; }
  .bildunterschrift { font-style: italic; font-size: 9.5pt; text-align: center; }
  .bildmarker { text-align: center; }
</style>
</head>
<body>
  <p class="kopfdatum">${maskiere(kopf.ort)}, ${deutschesDatum(kopf.datum)}</p>
  <p class="empfaenger">${maskiere(kopf.empfaengerName)}${anschrift ? `<br>${anschrift}` : ''}</p>
  ${absaetze.map((a) => absatzHtml(a, bilder)).join('\n  ')}
</body>
</html>
`
}

/** Rendert die Seite mit Chromium und gibt die PDF-Bytes zurück. */
export async function druckeStellungnahmePdf(
  kopf: Kopfdaten,
  absaetze: Absatz[],
  bilder: Map<string, PdfBild>,
): Promise<Buffer> {
  const html = baueBriefHtml(kopf, absaetze, bilder)
  const ordner = await mkdtemp(join(tmpdir(), 'stellungnahme-pdf-'))
  try {
    const htmlPfad = join(ordner, 'brief.html')
    const pdfPfad = join(ordner, 'brief.pdf')
    await writeFile(htmlPfad, html, 'utf8')
    await druckeHtml(htmlPfad, pdfPfad)
    return await readFile(pdfPfad)
  } finally {
    await rm(ordner, { recursive: true, force: true })
  }
}
