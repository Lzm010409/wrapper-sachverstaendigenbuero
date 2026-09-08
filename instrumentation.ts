/**
 * Läuft einmal beim Start des Servers, bevor die erste Anfrage kommt.
 *
 * Genau der richtige Ort, um den zweiten Protokollausgang anzumelden: die
 * Fehlerliste in der Datenbank. Täte man es in einem Modul, das nebenbei
 * importiert wird, hinge es davon ab, welche Seite zuerst aufgerufen wurde —
 * und ein Fehler beim Start stünde nirgends.
 *
 * `nodejs` als Laufzeit ist die Bedingung: die Datenbankverbindung gibt es in
 * der Edge-Laufzeit nicht.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { meldeFehlerlisteAn } = await import('@/protokoll/ablage')
  meldeFehlerlisteAn()
}

/**
 * Jeder Fehler, den niemand abgefangen hat.
 *
 * **Die Lücke, die das schliesst.** Bis hierher stand im Protokoll nur, was
 * eine Aufrufstelle ausdrücklich meldete. Stolperte eine Serverkomponente,
 * eine Route oder eine Serveraktion, sah der Benutzer die Fehlerseite mit
 * einer Kennung — und im Protokoll stand nichts. Genau die Fehler, von denen
 * niemand wusste, dass sie auftreten können, fehlten also.
 *
 * **Die Brücke zur Fehlerseite** ist der `digest`: Next zeigt ihn dem
 * Benutzer (`error.digest`), und hier steht er im Zusammenhang. Wer ihn im
 * Fehlerprotokoll sucht, bekommt genau diese Zeile — samt der eigenen
 * Kennung, der Stelle und der Stapelspur. Anders herum ginge es nicht: die
 * Fehlerseite läuft im Browser und kennt unsere Kennung nicht.
 */
export async function onRequestError(
  fehler: unknown,
  anfrage: { path: string; method: string },
  zusammenhang: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  // Die Edge-Laufzeit hat weder Datenbank noch `node:crypto`. Dort bleibt es
  // bei dem, was Next selbst auf die Konsole schreibt.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { protokolliereFehler } = await import('@/protokoll')
  protokolliereFehler(
    `unbehandelt.${zusammenhang.routeType}`,
    'Ein Fehler ist bis zur Fehlerseite durchgeschlagen.',
    fehler,
    {
      digest: typeof fehler === 'object' && fehler !== null && 'digest' in fehler
        ? String((fehler as { digest?: unknown }).digest)
        : undefined,
      pfad: anfrage.path,
      methode: anfrage.method,
      route: zusammenhang.routePath,
    },
  )
}
