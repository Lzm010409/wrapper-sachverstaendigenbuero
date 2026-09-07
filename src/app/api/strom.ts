import 'server-only'

/**
 * Macht aus einem Ereignisstrom eine Antwort.
 *
 * Ein Ereignis je Zeile, jedes für sich lesbares JSON. Kein
 * Server-Sent-Events-Format: das brächte nur Zeremonie, weil hier nichts
 * wiederverbunden oder nachgeliefert wird — der Vorgang läuft einmal, und
 * bricht die Verbindung ab, ist er ohnehin vorbei.
 */
export function alsStrom(ereignisse: AsyncIterable<unknown>): Response {
  const geber = new TextEncoder()

  const strom = new ReadableStream<Uint8Array>({
    async start(steuerung) {
      try {
        for await (const ereignis of ereignisse) {
          steuerung.enqueue(geber.encode(JSON.stringify(ereignis) + '\n'))
        }
      } catch (fehler) {
        console.error('Ereignisstrom abgebrochen:', fehler)
        steuerung.enqueue(
          geber.encode(
            JSON.stringify({
              art: 'fehler',
              fehler:
                fehler instanceof Error ? fehler.message : 'Der Vorgang ist unerwartet abgebrochen.',
            }) + '\n',
          ),
        )
      } finally {
        steuerung.close()
      }
    },
  })

  return new Response(strom, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Ohne diesen Hinweis puffern manche Gegenstellen den ganzen Strom
      // und liefern ihn erst am Ende aus — dann wäre nichts gewonnen.
      'X-Accel-Buffering': 'no',
    },
  })
}
