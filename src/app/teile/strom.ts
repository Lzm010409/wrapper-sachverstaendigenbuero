'use client'

/**
 * Liest einen Ereignisstrom Zeile für Zeile.
 *
 * Gegenstück zu `alsStrom` auf dem Server: ein Ereignis je Zeile. Die
 * letzte Zeile kann unvollständig ankommen, deshalb der Rest-Puffer — ohne
 * ihn ginge bei ungünstiger Paketgrenze genau die Abschlussmeldung
 * verloren.
 */
export async function* leseEreignisse<T>(antwort: Response): AsyncGenerator<T> {
  const leser = antwort.body?.getReader()
  if (!leser) return

  const nehmer = new TextDecoder()
  let rest = ''

  for (;;) {
    const { done, value } = await leser.read()
    if (done) break

    rest += nehmer.decode(value, { stream: true })
    const zeilen = rest.split('\n')
    rest = zeilen.pop() ?? ''

    for (const zeile of zeilen) {
      const t = zeile.trim()
      if (!t) continue
      try {
        yield JSON.parse(t) as T
      } catch {
        // Unlesbare Zeile überspringen — ein Ereignis weniger ist besser
        // als ein Abbruch mitten im Vorgang.
      }
    }
  }

  const letzte = rest.trim()
  if (letzte) {
    try {
      yield JSON.parse(letzte) as T
    } catch {
      /* siehe oben */
    }
  }
}
