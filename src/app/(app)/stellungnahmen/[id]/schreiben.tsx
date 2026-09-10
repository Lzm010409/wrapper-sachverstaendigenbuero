'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Meldung } from '@/app/teile/meldung'
import {
  ausErgebnis,
  erfolg,
  fehler,
  warnung,
  type Meldung as Meldungsdaten,
} from '@/melden/typen'
import { EditorContent, useEditor } from '@tiptap/react'
import {
  EREIGNIS_KOPF,
  EREIGNIS_MARKE,
  briefErweiterungen,
  type Kopfmeldung,
} from '@/dokument/editor-schema'
import {
  baueAnrede,
  baueEinleitung,
  istVorlagenAnrede,
  istVorlagenEinleitung,
  STANDARD_ANREDE,
} from '@/export/hausstil'
import {
  abschnittsReihenfolge,
  abschnittsText,
  einleitungsstelle,
  aktiverAbschnitt,
  dokumentJson,
  ankerHoehe,
  ersetzeAbschnittsInhalt,
  ersteHerkunft,
  fuegeAbschnittEin,
  fuegeAnStelleEin,
  fuegeBlockEin,
  entferneAbschnitt,
  fuegeInAbschnittEin,
  markiereAktivenAbschnitt,
  setzeAusgelassen,
  springeInAbschnitt,
  zeigeFundstelle,
} from '@/dokument/editor-hilfen'
import {
  BILD_BREITE_STANDARD,
  KNOTEN,
  absaetzeAusText,
  bildknoten,
  herkunftsmarke,
  type Herkunftsmarke,
} from '@/dokument/typen'
import {
  MIME_BAUSTEIN,
  MIME_BILD,
  leseBildziehgut,
  leseZiehgut,
  type Bildziehgut,
} from '@/dokument/ziehen'
import { Fortschritt, Kreisel, type Fortschrittsstand } from '@/app/teile/anzeigen'
import { Schnellauswahl } from './schnellauswahl'
import { leseEreignisse } from '@/app/teile/strom'
import type { Ausgabeereignis } from '@/stellungnahme/ausgabe'
import {
  entfernePosition,
  formuliereAbschnitt,
  pruefeDokument,
  setzeBehandlung,
  speichereDokument,
  uebernehmeAbschnittInBibliothek,
} from '@/stellungnahme/editor-aktionen'
import { markiereVersendet, nimmVersandZurueck } from '@/stellungnahme/export-aktionen'
import type { Pruefergebnis } from '@/export/waechter'
import type { Befund } from '@/export/waechter'
import { Blase, type PositionAnzeige, type Vorschlag } from './blase'
import type { Beteiligter } from '@/autoixpert/felder'

/** Empfängervorschlag aus dem Gutachten — Herkunft schon als Klartext. */
export interface Empfaengervorschlag {
  empfaenger: Beteiligter | null
  herkunftLabel: string
  betreff: string | null
}

/**
 * Der Schreibtisch: links der Brief, rechts die Anmerkungen.
 *
 * Der Brief ist die Hauptbearbeitungsfläche — alles, was am Rand passiert,
 * schreibt nur hinein. Die Bausteine sind eine Auswahlmethode, kein zweiter
 * Ort, an dem das Schreiben entsteht.
 */

const SPEICHERRUHE = 900

type Speicherzustand = 'ruht' | 'geaendert' | 'speichert' | 'konflikt' | 'fehler'

interface FertigeAusgabe {
  klartext: string
  docxBase64: string
  docxName: string
  txtName: string
}

const ZUSTANDSTEXT: Record<Speicherzustand, string> = {
  ruht: 'gespeichert',
  geaendert: 'ungespeicherte Änderung',
  speichert: 'speichert …',
  konflikt: 'Konflikt',
  fehler: 'nicht gespeichert',
}

export function Schreibtisch({
  stellungnahmeId,
  dokument,
  stand: anfangsStand,
  positionen,
  vorschlaege,
  werte,
  vorschlag,
  kiAktiv,
  versendet,
}: {
  stellungnahmeId: string
  dokument: unknown
  stand: number
  positionen: PositionAnzeige[]
  vorschlaege: Vorschlag[]
  werte: Record<string, string>
  vorschlag: Empfaengervorschlag
  kiAktiv: boolean
  versendet: boolean
}) {
  const [zustand, setzeZustand] = useState<Speicherzustand>('ruht')
  const [aktiv, setzeAktiv] = useState<string | null>(null)
  const [takt, setzeTakt] = useState(0)
  const [befunde, setzeBefunde] = useState<Befund[]>([])
  const [pruefung, setzePruefung] = useState<Pruefergebnis | null>(null)
  const [ausgabe, setzeAusgabe] = useState<FertigeAusgabe | null>(null)
  const [ausgabestand, setzeAusgabestand] = useState<Fortschrittsstand | null>(null)
  /*
    Die Art steht an der Meldung, nicht in ihrem Wortlaut. Vorher war das ein
    `string` und die Farbe wurde am Text erraten:
    `meldung.match(/sperr|gescheitert|nicht /i) ? 'fehler' : ''`. Das ging
    meistens gut und war jedes Mal Glück — wer eine Meldung umformuliert,
    hätte ihre Farbe geändert.
  */
  const [meldung, setzeMeldung] = useState<Meldungsdaten | null>(null)
  const [bildLaeuft, setzeBildLaeuft] = useState(0)
  const [fokus, setzeFokus] = useState(false)
  const [laeuft, starte] = useTransition()
  const router = useRouter()

  const standRef = useRef(anfangsStand)
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null)
  const briefRef = useRef<HTMLDivElement | null>(null)
  const randRef = useRef<HTMLDivElement | null>(null)
  const blasenRef = useRef(new Map<string, HTMLDivElement | null>())
  const dateiwahl = useRef<HTMLInputElement | null>(null)

  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)

  // Die Editor-Einstellungen entstehen einmal; das Ablegen der Bilder
  // braucht aber den jeweils aktuellen Stand. Deshalb der Umweg über eine
  // Verweiszelle statt der Funktion selbst.
  const bilderRef = useRef<
    (dateien: FileList | File[], koordinaten?: { left: number; top: number }) => void
  >(() => {})
  const bibliotheksbildRef = useRef<
    (gut: Bildziehgut, koordinaten?: { left: number; top: number }) => void
  >(() => {})

  const editor = useEditor({
    extensions: briefErweiterungen(werte),
    content: dokument as never,
    immediatelyRender: false,
    /*
      Ein versendetes Schreiben ist ein Beleg: was dort steht, ist das, was
      der Versicherer bekommen hat. Bisher liess es sich weiterschreiben —
      der Text änderte sich, der Versandvermerk blieb, und aus dem Beleg
      wurde eine Behauptung. Die Aktion weist das jetzt ab; hier steht die
      Sperre noch einmal sichtbar, damit niemand erst nach dem Tippen
      erfährt, dass nichts davon ankommt.
    */
    editable: !versendet,
    editorProps: {
      attributes: { class: 'brief-flaeche', spellcheck: 'true' },

      /**
       * Über dem ganzen Brief darf abgelegt werden — auch über einem Bild.
       *
       * Ein Wurf kommt nur zustande, wenn beim Überfliegen jemand sagt
       * „hier ist eine Ablagestelle". Für gewöhnlichen Text tut das
       * ProseMirror selbst; über einem Bild, das als unteilbarer Knoten
       * ohne bearbeitbaren Inhalt dasteht, tut es das nicht. Der Baustein
       * fiel dort ins Leere: kein `drop`, keine Meldung, nichts. Gefunden
       * hat das die Bedienprobe — mit der Mitschrift der Zieh-Ereignisse
       * und der Angabe, was unter dem Wurfpunkt lag.
       *
       * Wohin der Baustein dann tatsächlich kommt, entscheidet weiterhin
       * `fuegeAnStelleEin`: an den Absatz darunter, und nur innerhalb eines
       * Positionsabschnitts.
       */
      handleDOMEvents: {
        dragover: (_sicht, ereignis) => {
          const arten = (ereignis as DragEvent).dataTransfer?.types ?? []
          if (!arten.includes(MIME_BAUSTEIN) && !arten.includes(MIME_BILD)) return false
          ereignis.preventDefault()
          return false
        },
      },

      /**
       * Ein fallen gelassener Baustein landet hinter dem Absatz, über dem
       * losgelassen wurde — und nur innerhalb eines Positionsabschnitts.
       * Der Rückgabewert `true` hält ProseMirror davon ab, zusätzlich noch
       * den mitgereichten Klartext einzusetzen.
       */
      handleDrop: (_sicht, ereignis) => {
        const uebergabe = (ereignis as DragEvent).dataTransfer

        // Bilddateien zuerst: sie dürfen überall hin, auch ausserhalb der
        // Positionsabschnitte.
        const bilddateien = Array.from(uebergabe?.files ?? []).filter((d) =>
          d.type.startsWith('image/'),
        )
        if (bilddateien.length > 0) {
          ereignis.preventDefault()
          bilderRef.current(bilddateien, {
            left: (ereignis as DragEvent).clientX,
            top: (ereignis as DragEvent).clientY,
          })
          return true
        }

        const bibliotheksbild = uebergabe?.getData(MIME_BILD)
        if (bibliotheksbild) {
          ereignis.preventDefault()
          const gut = leseBildziehgut(bibliotheksbild)
          if (gut) {
            bibliotheksbildRef.current(gut, {
              left: (ereignis as DragEvent).clientX,
              top: (ereignis as DragEvent).clientY,
            })
          }
          return true
        }

        const daten = uebergabe?.getData(MIME_BAUSTEIN)
        if (!daten) return false
        ereignis.preventDefault()

        const gut = leseZiehgut(daten)
        const griff = editorRef.current
        if (!gut || !griff) return true

        const treffer = fuegeAnStelleEin(
          griff,
          {
            left: (ereignis as DragEvent).clientX,
            top: (ereignis as DragEvent).clientY,
          },
          absaetzeAusText(gut.text, [herkunftsmarke(gut.marke)]) as never,
        )
        if (!treffer) {
          setzeMeldung(
            warnung(
              'Ein Baustein gehört in einen Positionsabschnitt — nicht in Betreff, Ergebnis oder Signatur.',
            ),
          )
        }
        return true
      },

      /**
       * Eingefügte Bilder aus der Zwischenablage.
       *
       * Der Regelfall: ein Ausschnitt aus dem Kalkulationsprogramm liegt in
       * der Zwischenablage und soll an die Stelle, an der die Schreibmarke
       * steht. Dafür soll niemand erst eine Datei speichern müssen.
       */
      handlePaste: (_sicht, ereignis) => {
        const dateien = Array.from(ereignis.clipboardData?.files ?? []).filter((d) =>
          d.type.startsWith('image/'),
        )
        if (dateien.length === 0) return false
        ereignis.preventDefault()
        bilderRef.current(dateien)
        return true
      },
    },
    onUpdate: () => {
      setzeTakt((t) => t + 1)
      setzeZustand('geaendert')
      planeSpeichern()
    },
    onSelectionUpdate: ({ editor }) => setzeAktiv(aktiverAbschnitt(editor)),
  })

  editorRef.current = editor

  /**
   * Einmal prüfen, sobald das Schreiben dasteht.
   *
   * Vorher lief die Prüfung erst mit dem ersten Speichern. Wer ein
   * Schreiben öffnete und gleich auf „Dokument erzeugen" ging, erfuhr erst
   * dort, dass Beanstandungen die Ausgabe sperren — und suchte sie danach
   * am Rand. Jetzt steht der Stand der Wächter von Anfang an in der Leiste.
   */
  useEffect(() => {
    if (!editor) return
    let abgebrochen = false
    void (async () => {
      const ergebnis = await pruefeDokument(stellungnahmeId, dokumentJson(editor))
      if (abgebrochen) return
      setzeBefunde(ergebnis.befunde)
      setzePruefung(ergebnis)
    })()
    return () => {
      abgebrochen = true
    }
  }, [editor, stellungnahmeId])

  /* ---------------- Speichern ---------------- */

  const speichereJetzt = useCallback(async () => {
    if (!editor) return
    setzeZustand('speichert')
    const fassung = dokumentJson(editor)
    const e = await speichereDokument(stellungnahmeId, fassung, standRef.current)

    if ('stand' in e) {
      standRef.current = e.stand
      setzeZustand('ruht')
      // Die Prüfung läuft mit jedem gespeicherten Stand — die Wächter sind
      // damit Anmerkungen im Text und nicht erst eine Hürde vor dem Export.
      const ergebnis = await pruefeDokument(stellungnahmeId, fassung)
      setzeBefunde(ergebnis.befunde)
      setzePruefung(ergebnis)
      return
    }

    setzeZustand('konflikt' in e ? 'konflikt' : 'fehler')
    setzeMeldung(e.fehler ? fehler(e.fehler) : null)
  }, [editor, stellungnahmeId])

  const planeSpeichern = useCallback(() => {
    if (uhr.current) clearTimeout(uhr.current)
    uhr.current = setTimeout(() => void speichereJetzt(), SPEICHERRUHE)
  }, [speichereJetzt])

  // Beim Verlassen der Seite warnen, solange etwas aussteht.
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (zustand === 'geaendert' || zustand === 'speichert') e.preventDefault()
    }
    window.addEventListener('beforeunload', warnen)
    return () => window.removeEventListener('beforeunload', warnen)
  }, [zustand])

  useEffect(() => () => void (uhr.current && clearTimeout(uhr.current)), [])

  /* ---------------- Randspalte ausrichten ---------------- */

  /**
   * Die Marken im Papierrand.
   *
   * Der Knopf am Abschnitt meldet seinen Klick als Ereignis; hier wird
   * daraus die offene Anmerkung und ein Sprung in den Abschnitt. Bei
   * achtzehn Positionen ist das der kürzeste Weg zum Argument — man wählt
   * es dort, wo man liest.
   */
  useEffect(() => {
    const brief = briefRef.current
    if (!brief) return
    const hoere = (ereignis: Event) => {
      const id = (ereignis as CustomEvent<string>).detail
      if (typeof id !== 'string' || !id) return
      setzeAktiv(id)
      if (editor) springeInAbschnitt(editor, id)
    }
    brief.addEventListener(EREIGNIS_MARKE, hoere)
    return () => brief.removeEventListener(EREIGNIS_MARKE, hoere)
  }, [editor])

  /**
   * Trägt Anrede und Einleitungssatz nach, wenn der Kopf gespeichert wurde.
   *
   * Beides sind feste Bausteine des Hausstils und wurden bisher **einmal**
   * beim Anlegen gebaut. Das Datum des Anschreibens ist zu diesem Zeitpunkt
   * aber oft noch gar nicht bekannt: wer es später nachtrug, änderte damit
   * nur die Aktennotiz — im Brief blieb die Stelle leer, und im versandten
   * Schreiben fehlte der Einleitungssatz. Genauso beim Empfänger: die
   * Anrede blieb „Sehr geehrte Damen und Herren,", auch wenn im Feld
   * daneben längst eine Rechtsanwältin stand.
   *
   * Überschrieben wird nur, was noch aus der Vorlage stammt: eine leere
   * oder die allgemeine Anrede, ein leerer oder ein früher gebauter
   * Einleitungssatz. Eine Anrede, die auf einen Namen lautet, gilt
   * ausdrücklich als selbst geschrieben und bleibt stehen — auch wenn der
   * Empfänger wechselt. Das ist nicht die bequemste Regel, aber die
   * einzige, die niemandem seine Eingabe wegnimmt: die weite Fassung hat
   * genau das getan, und die Anwendung meldete dabei „gespeichert".
   *
   * Die Änderung geht als gewöhnliche Änderung durch: sie landet in der
   * Rückgängig-Kette und wird gespeichert wie jede andere.
   */
  useEffect(() => {
    if (!editor) return

    const hoere = (ereignis: Event) => {
      const daten = (ereignis as CustomEvent<Kopfmeldung>).detail
      if (!daten) return

      const anredeNeu = baueAnrede(daten.empfaengerName) ?? STANDARD_ANREDE
      const einleitungNeu =
        baueEinleitung({
          einleitungDatum: daten.einleitungDatum || null,
          einleitungMedium: daten.einleitungMedium === 'mail' ? 'mail' : 'schreiben',
        } as Parameters<typeof baueEinleitung>[0]) ?? ''

      const tr = editor.state.tr
      let geaendert = false

      editor.state.doc.descendants((knoten, pos) => {
        if (knoten.type.name === KNOTEN.anrede) {
          if (istVorlagenAnrede(knoten.textContent) && knoten.textContent.trim() !== anredeNeu) {
            tr.replaceWith(pos + 1, pos + knoten.nodeSize - 1, editor.schema.text(anredeNeu))
            geaendert = true
          }
          return false
        }
        return knoten.type.name === KNOTEN.dokument
      })

      /*
        Der Einleitungsabsatz ist der erste Absatz nach der Anrede — er
        trägt kein eigenes Merkmal, denn im Brief ist er gewöhnlicher Text.
        Deshalb wird er über seine Stelle bestimmt, genau wie beim
        Wiederherstellen nach einem Rundumschnitt.
      */
      const strecke = einleitungsstelle(editor)
      if (strecke && istVorlagenEinleitung(strecke.text) && strecke.text !== einleitungNeu) {
        /*
          Durch die Abbildung der Änderung geführt: die Anrede darüber ist
          gerade womöglich kürzer geworden — „Sehr geehrte Damen und
          Herren," gegen „Sehr geehrte Frau Busch," sind sechs Zeichen —,
          und die vorher gemessenen Stellen wären um genau diese Differenz
          verschoben. Der Einleitungssatz landete dann irgendwo oder gar
          nicht. Genau so ist es beim ersten Speichern passiert: die Anrede
          stand richtig da, die Einleitung blieb leer.
        */
        tr.replaceWith(
          tr.mapping.map(strecke.von),
          tr.mapping.map(strecke.bis),
          einleitungNeu
            ? editor.schema.nodes.paragraph!.create(null, editor.schema.text(einleitungNeu))
            : editor.schema.nodes.paragraph!.create(),
        )
        geaendert = true
      }

      if (geaendert) {
        editor.view.dispatch(tr)
        setzeMeldung(erfolg('Anrede und Einleitungssatz im Brief nachgetragen.'))
        /*
          Und sofort sichern, nicht erst nach der Schreibruhe.

          Diese Änderung kommt nicht vom Tippen, sondern aus einem Klick im
          Kopfbereich — dort steht danach „Gespeichert", und der Blick geht
          weiter. Wer in diesem Moment neu lädt, hätte den nachgetragenen
          Satz verloren, während beide Anzeigen „gespeichert" sagten. Die
          Bedienprobe hat genau das gefunden: in der Ablage stand noch der
          alte Wortlaut.
        */
        void speichereJetzt()
      }
    }

    window.addEventListener(EREIGNIS_KOPF, hoere)
    return () => window.removeEventListener(EREIGNIS_KOPF, hoere)
  }, [editor, speichereJetzt])

  /**
   * Den Abschnitt zur offenen Anmerkung hervorheben.
   *
   * Bei zwölf Positionen ist sonst nicht zu sehen, welche Anmerkung zu
   * welchem Abschnitt gehört. Die Marke geht in den Editor hinein statt als
   * Klasse an sein Element: ProseMirror soll nichts an seinem Baum finden,
   * was es nicht selbst geschrieben hat.
   */
  useEffect(() => {
    if (editor) markiereAktivenAbschnitt(editor, aktiv)
  }, [editor, aktiv])

  /**
   * Rückt jede Blase auf die Höhe ihres Abschnitts.
   *
   * Nacheinander, mit einer Untergrenze: die zweite Blase startet nie über
   * dem Ende der ersten. Ohne diesen Durchlauf lägen die Blasen kurzer
   * Abschnitte übereinander.
   */
  useLayoutEffect(() => {
    const brief = briefRef.current
    if (!brief) return

    let untergrenze = 0
    for (const p of positionen) {
      const el = blasenRef.current.get(p.id)
      if (!el) continue
      el.style.marginTop = '0px'
      const anker = ankerHoehe(brief, p.id)
      const ist = el.offsetTop
      const ziel = Math.max(anker ?? untergrenze, untergrenze)
      if (ziel > ist) el.style.marginTop = `${ziel - ist}px`
      untergrenze = el.offsetTop + el.offsetHeight + 10
    }
  })

  // Ein Umbruch im Brief verschiebt alle Anker — neu ausrichten.
  useEffect(() => {
    const brief = briefRef.current
    if (!brief || typeof ResizeObserver === 'undefined') return
    const beobachter = new ResizeObserver(() => setzeTakt((t) => t + 1))
    beobachter.observe(brief)
    return () => beobachter.disconnect()
  }, [])

  /* ---------------- Bilder ---------------- */

  /**
   * Lädt eine Bilddatei hoch und setzt sie an die gewünschte Stelle.
   *
   * Die Bytes gehen sofort auf den Server; im Dokument steht danach nur die
   * Kennung. Ein Bild als Datenstrom im Baum würde jede der Speicherungen im
   * Sekundentakt um Megabytes aufblähen.
   */
  const legeBildAb = useCallback(
    async (datei: File, koordinaten?: { left: number; top: number }) => {
      const griff = editorRef.current
      if (!griff) return

      setzeBildLaeuft((n) => n + 1)
      try {
        const formular = new FormData()
        formular.append('bild', datei)
        const antwort = await fetch(`/api/stellungnahmen/${stellungnahmeId}/bilder`, {
          method: 'POST',
          body: formular,
        })
        const ergebnis = (await antwort.json()) as {
          id?: string
          dateiname?: string
          breitePx?: number
          hoehePx?: number
          fehler?: string
        }

        if (!antwort.ok || !ergebnis.id) {
          setzeMeldung(fehler(ergebnis.fehler ?? 'Das Bild liess sich nicht hochladen.'))
          return
        }

        fuegeBlockEin(
          griff,
          bildknoten({
            bildId: ergebnis.id,
            breite: BILD_BREITE_STANDARD,
            breitePx: ergebnis.breitePx ?? 1000,
            hoehePx: ergebnis.hoehePx ?? 750,
            dateiname: ergebnis.dateiname ?? datei.name,
          }),
          koordinaten,
        )
      } catch {
        setzeMeldung(fehler('Das Bild liess sich nicht hochladen — die Verbindung ist abgerissen.'))
      } finally {
        setzeBildLaeuft((n) => n - 1)
      }
    },
    [stellungnahmeId],
  )

  /** Ein Bild aus der Bildbibliothek an die gewünschte Stelle setzen. */
  const setzeBibliotheksbild = useCallback(
    (gut: Bildziehgut, koordinaten?: { left: number; top: number }) => {
      const griff = editorRef.current
      if (!griff) return
      fuegeBlockEin(
        griff,
        bildknoten(
          {
            bildId: gut.bildId,
            breite: BILD_BREITE_STANDARD,
            breitePx: gut.breitePx,
            hoehePx: gut.hoehePx,
            dateiname: gut.dateiname,
          },
          gut.beschriftung,
        ),
        koordinaten,
      )
    },
    [],
  )

  const legeBilderAb = useCallback(
    (dateien: FileList | File[], koordinaten?: { left: number; top: number }) => {
      for (const datei of Array.from(dateien)) {
        if (!datei.type.startsWith('image/')) continue
        void legeBildAb(datei, koordinaten)
      }
    },
    [legeBildAb],
  )

  bilderRef.current = legeBilderAb
  bibliotheksbildRef.current = setzeBibliotheksbild

  /* ---------------- Griffe am Brief ---------------- */

  const einfuegen = (positionId: string, text: string, marke: Herkunftsmarke) => {
    if (!editor || !text.trim()) return
    fuegeInAbschnittEin(editor, positionId, absaetzeAusText(text, [herkunftsmarke(marke)]) as never)
  }

  const ausformulieren = (positionId: string) =>
    starte(async () => {
      if (!editor) return
      const text = abschnittsText(editor, positionId)
      const e = await formuliereAbschnitt(stellungnahmeId, positionId, text)
      if (e.fehler || !e.text) {
        setzeMeldung(fehler(e.fehler ?? 'Das Ausformulieren hat nichts geliefert.'))
        return
      }
      const herkunft = ersteHerkunft(editor, positionId)
      ersetzeAbschnittsInhalt(
        editor,
        positionId,
        absaetzeAusText(e.text, [
          herkunftsmarke({
            eintragId: herkunft?.eintragId ?? null,
            nummer: herkunft?.nummer ?? null,
            titel: herkunft?.titel ?? null,
            herkunft: 'formuliert',
          }),
        ]) as never,
      )
      setzeMeldung(erfolg('Abschnitt ausformuliert. Rückgängig mit Strg+Z.'))
    })

  const herausnehmen = (positionId: string) =>
    starte(async () => {
      if (!editor) return
      setzeAusgelassen(editor, positionId, true)
      await setzeBehandlung(positionId, 'nicht_bestreiten')
    })

  const aufnehmen = (positionId: string, bezeichnung: string) =>
    starte(async () => {
      if (!editor) return
      // Der Abschnitt steht in aller Regel noch da und wird nur wieder
      // aufgenommen. Nur wenn er wirklich fehlt — etwa in einem alten
      // Dokument — entsteht er neu, an seiner Stelle in der Reihenfolge.
      if (!setzeAusgelassen(editor, positionId, false)) {
        fuegeAbschnittEin(
          editor,
          positionId,
          bezeichnung,
          positionen.map((p) => p.id),
        )
      }
      await setzeBehandlung(positionId, 'bestritten')
    })

  /**
   * Nimmt eine Position ganz aus dem Fall.
   *
   * Erst der Abschnitt, dann das Speichern, dann die Zeile: in dieser
   * Reihenfolge, damit nach einem Fehlschlag nie eine Position ohne
   * Abschnitt oder ein Abschnitt ohne Position übrig bleibt.
   */
  const entfernen = (positionId: string, bezeichnung: string) => {
    if (
      !window.confirm(
        `„${bezeichnung}" ganz aus diesem Fall entfernen? ` +
          'Der Abschnitt und die Anmerkung dazu verschwinden. ' +
          'Soll die Kürzung nur hingenommen werden, ist „Nicht bestreiten" der richtige Weg.',
      )
    ) {
      return
    }
    starte(async () => {
      if (!editor) return
      entferneAbschnitt(editor, positionId)
      await speichereJetzt()
      const e = await entfernePosition(positionId)
      if (e.fehler) {
        setzeMeldung(fehler(e.fehler))
        return
      }
      setzeAktiv(null)
      router.refresh()
    })
  }

  const inBibliothek = (positionId: string) =>
    starte(async () => {
      if (!editor) return
      const e = await uebernehmeAbschnittInBibliothek(
        stellungnahmeId,
        positionId,
        dokumentJson(editor),
      )
      setzeMeldung(ausErgebnis(e))
    })

  const springeZu = (b: Befund) => {
    if (!editor || !b.fundstelle) return
    if (!zeigeFundstelle(editor, b.positionId, b.fundstelle)) {
      setzeMeldung(warnung('Diese Stelle steht so nicht mehr im Brief.'))
    }
  }

  /* ---------------- Ausgabe ---------------- */

  /**
   * Erzeugt Word- und Klartextfassung und meldet dabei jeden Schritt.
   *
   * Geprüft und ausgegeben wird die Fassung, die gerade im Editor steht —
   * nicht der zuletzt gespeicherte Stand.
   */
  const erzeugeDokument = async () => {
    if (!editor) return

    setzeAusgabe(null)
    setzeMeldung(null)
    const verlauf: string[] = []
    setzeAusgabestand({
      anteil: 0.03,
      text: 'Das Schreiben wird übergeben …',
      verlauf,
    })

    let antwort: Response
    try {
      antwort = await fetch(`/api/stellungnahmen/${stellungnahmeId}/ausgabe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokument: dokumentJson(editor) }),
      })
    } catch {
      setzeAusgabestand(null)
      setzeMeldung(fehler('Die Verbindung ist abgerissen.'))
      return
    }

    for await (const ereignis of leseEreignisse<Ausgabeereignis>(antwort)) {
      if (ereignis.art === 'fortschritt') {
        verlauf.push(ereignis.text)
        setzeAusgabestand({
          anteil: ereignis.anteil,
          text: ereignis.text,
          verlauf: verlauf.slice(-3),
        })
        continue
      }

      if (ereignis.art === 'fehler') {
        setzeAusgabestand(null)
        setzeMeldung(fehler(ereignis.fehler))
        if (ereignis.befunde) {
          /**
           * Die erste sperrende Stelle aufschlagen.
           *
           * Eine Meldung „vier Prüfungen sperren die Ausgabe" ist eine
           * Aufgabe ohne Adresse. Die Anmerkung dazu wird deshalb gleich
           * geöffnet und der Abschnitt angesprungen — von dort führt jeder
           * Befund weiter an seine Fundstelle im Text.
           */
          const erste = ereignis.befunde.find((b) => b.schwere === 'sperrt' && b.positionId)
          if (erste?.positionId) {
            setzeAktiv(erste.positionId)
            springeInAbschnitt(editor, erste.positionId)
          }
          setzeBefunde(ereignis.befunde)
          setzePruefung({
            befunde: ereignis.befunde,
            gesperrt: true,
            zusammenfassung: {
              sperrt: ereignis.befunde.filter((b) => b.schwere === 'sperrt').length,
              warnt: ereignis.befunde.filter((b) => b.schwere !== 'sperrt').length,
            },
          })
        }
        return
      }

      setzeAusgabestand(null)
      setzeAusgabe({
        klartext: ereignis.klartext,
        docxBase64: ereignis.docxBase64,
        docxName: ereignis.docxName,
        txtName: ereignis.txtName,
      })
      setzeBefunde(ereignis.befunde)
      return
    }

    setzeAusgabestand(null)
    setzeMeldung(fehler('Der Vorgang ist unterwegs abgebrochen.'))
  }

  const lade = (name: string, inhalt: BlobPart, typ: string) => {
    const url = URL.createObjectURL(new Blob([inhalt], { type: typ }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const ladeDocx = () => {
    if (!ausgabe?.docxBase64 || !ausgabe.docxName) return
    const roh = atob(ausgabe.docxBase64)
    const bytes = new Uint8Array(roh.length)
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i)
    lade(
      ausgabe.docxName,
      bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  }

  /* ---------------- Anzeige ---------------- */

  const reihenfolge = editor ? abschnittsReihenfolge(editor) : []
  void takt // die Anzeige hängt am Takt: jede Änderung im Brief rechnet neu
  const nummerJePosition = new Map<string, number>()
  let laufend = 0
  for (const a of reihenfolge) {
    if (a.hatText && !a.ausgelassen) nummerJePosition.set(a.positionId, ++laufend)
  }
  /*
    Der Name, unter dem eine Position in der Oberfläche erscheint.

    Die Überschrift im Brief gewinnt: sie ist das, was ein Mensch der
    Position gegeben hat. Der Name aus dem Prüfbericht springt ein, solange
    keine Überschrift geschrieben wurde — und bleibt in der Anmerkung als
    Herkunft sichtbar, wo er etwas erklärt. Vorher zeigten Anmerkung, Leiste
    und Löschabfrage stur den Prüfbericht-Namen, auch wenn im Brief längst
    etwas anderes stand: zwei Namen für dieselbe Sache.
  */
  const ueberschriftJePosition = new Map(
    reihenfolge.filter((a) => a.ueberschrift).map((a) => [a.positionId, a.ueberschrift]),
  )
  const benenne = (p: { id: string; bezeichnung: string }) =>
    ueberschriftJePosition.get(p.id) || p.bezeichnung

  const imBrief = new Set(reihenfolge.filter((a) => !a.ausgelassen).map((a) => a.positionId))
  const mitText = new Set(
    reihenfolge.filter((a) => a.hatText && !a.ausgelassen).map((a) => a.positionId),
  )

  const befundeJePosition = new Map<string, Befund[]>()
  for (const b of befunde) {
    const schluessel = b.positionId ?? '—'
    befundeJePosition.set(schluessel, [...(befundeJePosition.get(schluessel) ?? []), b])
  }

  return (
    <div className="werkbank">
      {/*
        Ohne diesen Satz war der geschlossene Zustand unsichtbar: der Brief
        sah aus wie immer, nur nahm er keine Eingabe mehr an — und wer
        tippte, erfuhr den Grund nirgends.
      */}
      {versendet ? (
        <div className="hinweis warn" style={{ marginBottom: 12 }} role="status">
          Dieses Schreiben ist als versendet vermerkt und deshalb geschlossen: der Text lässt sich
          nicht mehr ändern, Positionen nicht mehr entfernen. So bleibt nachvollziehbar, was das
          Haus verlassen hat. Mit „Versandvermerk zurücknehmen" unten steht es wieder offen.
        </div>
      ) : null}

      <div className="werkbank-leiste">
        <div className="werkzeuge">
          <button
            type="button"
            title="Fett"
            className={editor?.isActive('bold') ? 'an' : ''}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <strong>F</strong>
          </button>
          <button
            type="button"
            title="Kursiv"
            className={editor?.isActive('italic') ? 'an' : ''}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <em>K</em>
          </button>
          <button
            type="button"
            title="Aufzählung"
            className={editor?.isActive('bulletList') ? 'an' : ''}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            ▪ Liste
          </button>
          <button
            type="button"
            title="Bild an der Schreibmarke einfügen — geht auch mit Einfügen aus der Zwischenablage oder durch Ziehen"
            onClick={() => dateiwahl.current?.click()}
          >
            {bildLaeuft > 0 ? <Kreisel text="Bild …" /> : '▣ Bild'}
          </button>
          <input
            ref={dateiwahl}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) legeBilderAb(e.target.files)
              e.target.value = ''
            }}
          />

          <button
            type="button"
            title="Rückgängig"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            ↶
          </button>
          <button
            type="button"
            title="Wiederherstellen"
            onClick={() => editor?.chain().focus().redo().run()}
          >
            ↷
          </button>
          <button
            type="button"
            className={fokus ? 'an' : ''}
            title={fokus ? 'Anmerkungen wieder einblenden' : 'Nur den Brief zeigen'}
            aria-pressed={fokus}
            onClick={() => setzeFokus((f) => !f)}
          >
            {fokus ? '◨ Anmerkungen' : '▭ Fokus'}
          </button>

          <span className={`speicherstand ${zustand}`}>
            {zustand === 'speichert' ? (
              <Kreisel text={ZUSTANDSTEXT[zustand]} />
            ) : (
              ZUSTANDSTEXT[zustand]
            )}
          </span>
        </div>

        {/*
        Die Positionsleiste: eine Marke je Kürzungsposition mit ihrem Stand.
        Bei zwölf Positionen ist sie der schnellste Weg an die Stelle, an der
        noch etwas fehlt — und sie zeigt auf einen Blick, wie weit das
        Schreiben ist.
      */}
        {positionen.length > 0 ? (
          <div className="positionsleiste" role="group" aria-label="Positionen">
            {positionen.map((p, i) => {
              const zahl = befundeJePosition.get(p.id)?.length ?? 0
              const zustandsname = !imBrief.has(p.id)
                ? 'draussen'
                : mitText.has(p.id)
                  ? 'fertig'
                  : 'leer'
              const stand = !imBrief.has(p.id)
                ? 'nicht bestritten'
                : mitText.has(p.id)
                  ? `im Schreiben als Nr. ${nummerJePosition.get(p.id)}`
                  : 'noch ohne Text'
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`positionsmarke ${zustandsname} ${aktiv === p.id ? 'aktiv' : ''}`}
                  title={
                    `Position ${i + 1} des Prüfberichts: ${benenne(p)}` +
                    `${p.differenz ? ` · −${p.differenz} €` : ''} — ${stand}`
                  }
                  onClick={() => {
                    setzeAktiv(p.id)
                    if (editor && imBrief.has(p.id)) springeInAbschnitt(editor, p.id)
                  }}
                >
                  {/*
                    Die Zahl ist die des Prüfberichts, nicht die des Briefes:
                    sie steht fest, solange die Position zum Fall gehört.
                    Vorher stand hier die Nummer im Schreiben — die gibt es
                    erst, sobald der Abschnitt Text hat, und bis dahin sah die
                    ganze Leiste aus wie eine Reihe von Strichen.
                  */}
                  <span>{i + 1}</span>
                  {zahl > 0 ? <em>{zahl}</em> : null}
                </button>
              )
            })}
          </div>
        ) : null}

        <div className="werkzeuge">
          {pruefung ? (
            <span className="pruefstand">
              {pruefung.zusammenfassung.sperrt > 0 ? (
                <span className="marke-pille m-zurueckgezogen">
                  {pruefung.zusammenfassung.sperrt} sperrend
                </span>
              ) : null}
              {pruefung.zusammenfassung.warnt > 0 ? (
                <span className="marke-pille m-warn">
                  {pruefung.zusammenfassung.warnt} zu prüfen
                </span>
              ) : null}
              {pruefung.befunde.length === 0 ? (
                <span className="marke-pille m-freigegeben">nichts zu beanstanden</span>
              ) : null}
            </span>
          ) : null}

          <button
            type="button"
            className="haupt"
            disabled={!editor || ausgabestand !== null}
            onClick={() => void erzeugeDokument()}
          >
            {ausgabestand ? <Kreisel text="Dokument erzeugen" /> : 'Dokument erzeugen'}
          </button>

          {!versendet ? (
            <button
              type="button"
              className="freigabe"
              disabled={laeuft}
              onClick={() =>
                starte(async () => {
                  const e = await markiereVersendet(stellungnahmeId)
                  setzeMeldung(e.hinweis ? erfolg(e.hinweis) : null)
                  router.refresh()
                })
              }
            >
              {laeuft ? <Kreisel text="Versendet" /> : 'Versendet'}
            </button>
          ) : (
            /*
              Der Rückweg. Ohne ihn war „Versendet" eine Einbahnstrasse: der
              Knopf verschwand, das Löschen verwies auf einen Vermerk, den
              niemand zurücknehmen konnte, und ein versehentlicher Klick
              liess sich nicht berichtigen.
            */
            <button
              type="button"
              disabled={laeuft}
              onClick={() =>
                starte(async () => {
                  const e = await nimmVersandZurueck(stellungnahmeId)
                  setzeMeldung(e.hinweis ? erfolg(e.hinweis) : null)
                  router.refresh()
                })
              }
            >
              {laeuft ? <Kreisel text="Versandvermerk zurücknehmen" /> : 'Versandvermerk zurücknehmen'}
            </button>
          )}
        </div>
      </div>

      {meldung ? (
        <Meldung art={meldung.art} style={{ marginBottom: 12 }}>
          {meldung.text}
          {zustand === 'konflikt' ? (
            <>
              {' '}
              <button type="button" onClick={() => window.location.reload()}>
                Neu laden
              </button>
            </>
          ) : null}
        </Meldung>
      ) : null}

      {ausgabestand ? (
        <div style={{ marginBottom: 14 }}>
          <Fortschritt stand={ausgabestand} />
        </div>
      ) : null}

      {ausgabe?.klartext ? (
        <div className="ausgabe-leiste">
          <span>Fertiges Dokument:</span>
          <button type="button" className="haupt" onClick={ladeDocx}>
            {ausgabe.docxName}
          </button>
          <button
            type="button"
            onClick={() => lade(ausgabe.txtName!, ausgabe.klartext!, 'text/plain;charset=utf-8')}
          >
            {ausgabe.txtName}
          </button>
        </div>
      ) : null}

      <div className={`werkbank-raster ${fokus ? 'fokus' : ''}`}>
        <div className="brief" ref={briefRef}>
          <Schnellauswahl editor={editor} />
          <EditorContent editor={editor} />
        </div>

        <aside className="rand" ref={randRef}>
          <div className="rand-karten">
            <div className="karte">
              <h2>Vorschlag für die Stellungnahme</h2>
              {vorschlag.empfaenger ? (
                <>
                  <p className="unterzeile" style={{ marginTop: 0 }}>
                    {vorschlag.herkunftLabel}
                  </p>
                  <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>
                    {vorschlag.empfaenger.name}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-mid)' }}>
                    {vorschlag.empfaenger.strasse}
                    {vorschlag.empfaenger.strasse ? <br /> : null}
                    {vorschlag.empfaenger.plzOrt}
                  </p>
                  {vorschlag.betreff ? (
                    <p style={{ margin: '12px 0 0', fontSize: 13 }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Betreff: </span>
                      {vorschlag.betreff}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="unterzeile" style={{ margin: 0 }}>
                  Kein Empfänger im Gutachten hinterlegt.
                </p>
              )}
            </div>

            <div className="karte">
              <h2>Verfügbare Platzhalter</h2>
              <p className="unterzeile" style={{ marginTop: 0 }}>
                Werden beim Einfügen eines Bibliothekstexts automatisch gesetzt.
              </p>
              {Object.keys(werte).length === 0 ? (
                <p className="unterzeile" style={{ margin: 0 }}>
                  Keine — die Falldaten sind zu dünn.
                </p>
              ) : (
                <dl className="kv">
                  {Object.entries(werte).map(([schluessel, wert]) => (
                    <span key={schluessel} style={{ display: 'contents' }}>
                      <dt>
                        <code style={{ fontSize: 11 }}>[{schluessel}]</code>
                      </dt>
                      <dd style={{ textAlign: 'left', fontSize: 12.5 }}>{wert}</dd>
                    </span>
                  ))}
                </dl>
              )}
            </div>
          </div>

          {/* Die Zahl an der Blase ist die des Prüfberichts — dieselbe wie
              auf der Marke in der Leiste. Vorher war es die Nummer im
              Schreiben, die es erst mit Text gibt: bei einem frischen Fall
              stand am ganzen Rand nur ein Strich. */}
          {positionen.map((p, i) => (
            <div
              key={p.id}
              ref={(el) => {
                blasenRef.current.set(p.id, el)
              }}
            >
              <Blase
                position={p}
                ueberschrift={ueberschriftJePosition.get(p.id) ?? ''}
                vorschlag={vorschlaege.find((v) => v.positionId === p.id)}
                befunde={befundeJePosition.get(p.id) ?? []}
                nummer={i + 1}
                imBrief={imBrief.has(p.id)}
                hatText={mitText.has(p.id)}
                aktiv={aktiv === p.id}
                werte={werte}
                kiAktiv={kiAktiv}
                laeuft={laeuft}
                aufAktivieren={() => {
                  setzeAktiv(p.id)
                  if (editor && imBrief.has(p.id)) springeInAbschnitt(editor, p.id)
                }}
                aufEinfuegen={(text, marke) => einfuegen(p.id, text, marke)}
                aufAusformulieren={() => ausformulieren(p.id)}
                aufHerausnehmen={() => herausnehmen(p.id)}
                aufAufnehmen={() => aufnehmen(p.id, benenne(p))}
                aufEntfernen={() => entfernen(p.id, benenne(p))}
                aufFundstelle={springeZu}
                aufInBibliothek={() => inBibliothek(p.id)}
                aufBildEinfuegen={(gut) => setzeBibliotheksbild(gut)}
              />
            </div>
          ))}

          {(befundeJePosition.get('—') ?? []).length > 0 ? (
            <div className="blase auf">
              <div className="blase-kopf">
                <span className="blase-titel">Zum ganzen Schreiben</span>
              </div>
              <div className="blase-befunde">
                {(befundeJePosition.get('—') ?? []).map((b, i) => (
                  <div key={i} className={`befund ${b.schwere}`}>
                    <span className="marke-pille m-akzent">{b.kennung}</span>
                    <span>
                      <strong>{b.titel}</strong>
                      <br />
                      {b.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
