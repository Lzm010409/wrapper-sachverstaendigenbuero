/**
 * Startvorgang des Containers.
 *
 *   1. Datenbankschema anlegen bzw. fortschreiben
 *   2. Argumentbibliothek befüllen, falls sie noch leer ist
 *   3. Fotolexikon um fehlende Beispielteile ergänzen
 *   4. Den Next-Server starten
 *
 * Bewusst reines JavaScript ohne Werkzeugkette: im Laufzeit-Abbild liegt nur
 * die Standalone-Ausgabe von Next. Verwendet wird ausschließlich `postgres`,
 * das die Anwendung ohnehin mitbringt.
 *
 * Der Ablauf ist wiederholbar: bereits angewandte Migrationen werden
 * übersprungen, und beide Startbefüllungen ergänzen nur, was fehlt — ein
 * Neustart überschreibt also keine gepflegten Einträge.
 */
import { readFileSync, readdirSync, existsSync, accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'
import postgres from 'postgres'

const scrypt = promisify(scryptCb)

const WURZEL = process.cwd()
const MIGRATIONEN = join(WURZEL, 'drizzle')
const STARTBEFUELLUNG = join(WURZEL, 'seed', 'bibliothek.json')
const STARTBEFUELLUNG_FOTOLEXIKON = join(WURZEL, 'seed', 'fotolexikon.json')

function melde(text) {
  console.log(`[start] ${text}`)
}

async function wendeMigrationenAn(sql) {
  if (!existsSync(MIGRATIONEN)) {
    melde('Kein Migrationsverzeichnis gefunden — übersprungen.')
    return
  }

  await sql`
    create table if not exists __migrationen (
      name text primary key,
      pruefsumme text not null,
      angewandt_am timestamptz not null default now()
    )
  `

  const angewandt = new Map(
    (await sql`select name, pruefsumme from __migrationen`).map((z) => [z.name, z.pruefsumme]),
  )

  const dateien = readdirSync(MIGRATIONEN)
    .filter((d) => d.endsWith('.sql'))
    .sort()

  for (const datei of dateien) {
    const inhalt = readFileSync(join(MIGRATIONEN, datei), 'utf8')
    const pruefsumme = createHash('sha256').update(inhalt).digest('hex').slice(0, 16)

    const bekannt = angewandt.get(datei)
    if (bekannt) {
      if (bekannt !== pruefsumme) {
        // Eine nachträglich geänderte Migration ist ein Fehler in der
        // Entwicklung, kein Zustand, den der Start stillschweigend heilt.
        melde(`WARNUNG: ${datei} wurde nach dem Anwenden verändert.`)
      }
      continue
    }

    melde(`Migration ${datei} …`)
    // Drizzle trennt Anweisungen mit diesem Marker.
    const anweisungen = inhalt
      .split('--> statement-breakpoint')
      .map((a) => a.trim())
      .filter(Boolean)

    await sql.begin(async (tx) => {
      for (const anweisung of anweisungen) {
        await tx.unsafe(anweisung)
      }
      await tx`insert into __migrationen (name, pruefsumme) values (${datei}, ${pruefsumme})`
    })
  }

  melde(`Schema aktuell (${dateien.length} Migration${dateien.length === 1 ? '' : 'en'}).`)
}

async function befuelleBibliothek(sql) {
  if (!existsSync(STARTBEFUELLUNG)) {
    melde('Keine Startbefüllung vorhanden — übersprungen.')
    return
  }

  const { eintraege } = JSON.parse(readFileSync(STARTBEFUELLUNG, 'utf8'))

  /*
    Abgleich statt Erstbefüllung.

    Früher lief dieser Schritt nur, solange die Bibliothek leer war. Damit
    erreichte eine erweiterte Bibliothek die laufende Anwendung nie: Wer einen
    Baustein ergänzte, musste ihn von Hand nachtragen. Jetzt wird bei jedem
    Start abgeglichen — aber nur, was sich wirklich geändert hat.

    Der Fingerabdruck entscheidet. Stimmt er, bleibt der Eintrag unangetastet:
    Status, Freigabe und Datum. Sonst wird er ersetzt und fällt auf `entwurf`
    zurück, denn eine Freigabe bezieht sich auf einen bestimmten Wortlaut.
    Einträge, die in der Datenbank stehen, aber nicht in der Startbefüllung
    (von Hand angelegte etwa), bleiben in jedem Fall unberührt — hier wird
    nichts gelöscht.
  */
  const vorhanden = new Map(
    (
      await sql`select bereich, nummer, inhaltsfingerabdruck from eintrag where herkunft = 'migration'`
    ).map((z) => [`${z.bereich}/${z.nummer}`, z.inhaltsfingerabdruck]),
  )

  let neuAngelegt = 0
  let geaendert = 0
  let unveraendert = 0

  for (const e of eintraege) {
    const schluessel = `${e.bereich}/${e.nummer}`
    const bekannt = vorhanden.has(schluessel)

    if (bekannt && vorhanden.get(schluessel) === e.fingerabdruck) {
      unveraendert++
      continue
    }
    if (bekannt) geaendert++
    else neuAngelegt++

    await sql.begin(async (tx) => {
      // Unterdatensätze hängen per ON DELETE CASCADE am Eintrag.
      if (bekannt) {
        await tx`delete from eintrag where bereich = ${e.bereich} and nummer = ${e.nummer}`
      }
      const [angelegt] = await tx`
        insert into eintrag (
          nummer, titel, bereich, abschnitt, typische_begruendung,
          gegenargument, vorgehen, hinweise, haeufigkeit_text,
          status, herkunft, quelldatei, inhaltsfingerabdruck
        ) values (
          ${e.nummer}, ${e.titel}, ${e.bereich}, ${e.abschnitt}, ${e.typischeBegruendung},
          ${e.gegenargument || null}, ${e.vorgehen}, ${e.hinweise}, ${e.haeufigkeitText},
          'entwurf', 'migration', ${e.quelldatei}, ${e.fingerabdruck ?? null}
        )
        returning id
      `
      const id = angelegt.id

      for (const [i, v] of e.varianten.entries()) {
        await tx`
          insert into eintrag_variante (eintrag_id, bezeichnung, text, reihenfolge)
          values (${id}, ${v.bezeichnung || `Variante ${i + 1}`}, ${v.text}, ${i})
        `
      }
      for (const [i, x] of e.ergaenzungen.entries()) {
        await tx`
          insert into eintrag_ergaenzung (eintrag_id, titel, text, reihenfolge)
          values (${id}, ${x.titel}, ${x.text}, ${i})
        `
      }
      for (const p of e.platzhalter) {
        await tx`
          insert into eintrag_platzhalter (eintrag_id, schluessel, art, quelle, pflicht)
          values (${id}, ${p.schluessel}, ${p.art}, 'manuell', true)
        `
      }
      for (const text of e.vorbedingungsKandidaten) {
        await tx`
          insert into eintrag_vorbedingung (eintrag_id, text, muss_bestaetigt_werden)
          values (${id}, ${text}, true)
        `
      }
      for (const b of e.belege) {
        await tx`
          insert into beleg (eintrag_id, typ, gericht, aktenzeichen)
          values (${id}, 'urteil', ${b.gericht}, ${b.aktenzeichen})
        `
      }
    })
  }

  if (neuAngelegt === 0 && geaendert === 0) {
    melde(`Bibliothek ist auf Stand — ${unveraendert} Einträge unverändert.`)
  } else {
    melde(
      `Bibliothek abgeglichen: ${neuAngelegt} neu, ${geaendert} geändert, ` +
        `${unveraendert} unverändert. Neue und geänderte stehen auf „entwurf".`,
    )
  }
}

/**
 * Ergänzt das Fotolexikon um fehlende Beispielteile.
 *
 * Anders als die Bibliothek wird hier nicht abgeglichen, sondern nur
 * ergänzt: das Fotolexikon ist von Anfang an zur Pflege über die
 * Verwaltungsseite gedacht (`src/app/(app)/verwaltung/fotolexikon`), ein
 * Teil dort kann also frei umbenannt oder umformuliert sein. Ein Neustart
 * legt einen Namen aus der Startbefüllung nur an, wenn er noch nicht
 * existiert — er ändert nie einen vorhandenen Eintrag und löscht nie einen.
 */
async function befuelleFotolexikon(sql) {
  if (!existsSync(STARTBEFUELLUNG_FOTOLEXIKON)) {
    melde('Keine Fotolexikon-Startbefüllung vorhanden — übersprungen.')
    return
  }

  const teile = JSON.parse(readFileSync(STARTBEFUELLUNG_FOTOLEXIKON, 'utf8'))

  const vorhanden = new Set(
    (await sql`select lower(name) as name from foto_teil`).map((z) => z.name),
  )

  let angelegt = 0
  for (const teil of teile) {
    if (vorhanden.has(teil.name.toLowerCase())) continue

    // Beschädigungsarten gehen als Text durch die Bindung und werden erst in
    // der Anweisung selbst zum passenden Typ gecastet — ohne Annahmen
    // darüber, wie `postgres` ein rohes JS-Objekt sonst serialisieren würde.
    await sql`
      insert into foto_teil (name, erkennungsmerkmal, beschaedigungsarten)
      values (
        ${teil.name},
        ${teil.erkennungsmerkmal ?? null},
        ${JSON.stringify(teil.beschaedigungsarten)}::jsonb
      )
    `
    angelegt++
  }

  if (angelegt > 0) {
    melde(`Fotolexikon ergänzt: ${angelegt} Teil${angelegt === 1 ? '' : 'e'} neu angelegt.`)
  } else {
    melde('Fotolexikon ist auf Stand — nichts Neues aus der Startbefüllung.')
  }
}

/**
 * Legt beim allerersten Start einen Zugang an, damit die Anwendung nicht
 * ohne Anmeldemöglichkeit dasteht.
 *
 * Greift ausschließlich, solange es überhaupt keinen Benutzer gibt — ein
 * später gesetzter oder vergessener Umgebungswert kann also weder ein Konto
 * überschreiben noch heimlich ein zweites anlegen.
 *
 * Das Hashverfahren muss zu `src/auth/passwort.ts` passen: gleiche
 * Parameter, gleiches Format `scrypt$N$r$p$salz$hash`.
 */
async function legeErstenZugangAn(sql) {
  const email = process.env.ERSTER_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) return

  const [{ anzahl }] = await sql`select count(*)::int as anzahl from benutzer`
  if (anzahl > 0) return

  const name = process.env.ERSTER_ADMIN_NAME?.trim() || email.split('@')[0]
  const passwort = process.env.ERSTER_ADMIN_PASSWORT

  let hash = null
  if (passwort) {
    const N = 2 ** 17
    const salz = randomBytes(16)
    const abgeleitet = await scrypt(passwort.normalize('NFKC'), salz, 64, {
      N,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    })
    hash = ['scrypt', N, 8, 1, salz.toString('base64'), abgeleitet.toString('base64')].join('$')
  }

  await sql`
    insert into benutzer (email, name, passwort_hash, rolle)
    values (${email}, ${name}, ${hash}, 'admin')
  `
  melde(
    `Erster Zugang angelegt: ${email} (${hash ? 'mit Passwort' : 'nur über Microsoft Entra'}).`,
  )
}

/**
 * Verdrahtet die Kleinanzeigen-Beschaffung mit der Anwendung selbst.
 *
 * Das WBW-Plugin fragt die Trefferliste über `KA_API_BASE` ab. Bisher zeigte
 * diese Adresse auf einen zweiten, eigens betriebenen Dienst; das Cockpit
 * beantwortet dieselben Aufrufe jetzt selbst unter `/api/kleinanzeigen`.
 * Voreingestellt wird deshalb der eigene Server — und ein Zugangswort dazu,
 * damit die Route nicht offen im Netz steht.
 *
 * **Nichts wird überschrieben.** Wer `KA_API_BASE` in Coolify setzt, spricht
 * weiter gegen den alten Dienst; der Wechsel bleibt eine Variable.
 */
async function raeumeWbwLaeufeAuf(sql) {
  // Ein Recherchelauf laeuft im Prozess der Anwendung. Startet der Container
  // neu, ist er fort - die Zeile stuende sonst fuer immer auf "laeuft" und die
  // Oberflaeche wartete auf einen Fortschritt, der nie kommt.
  const betroffen = await sql`
    update wbw_lauf
       set zustand = 'fehler',
           fehler = 'Der Server wurde neu gestartet, waehrend die Recherche lief. Der Lauf muss neu angestossen werden.',
           beendet_am = now()
     where zustand = 'laeuft'
    returning id
  `
  if (betroffen.length > 0) {
    melde(
      `${betroffen.length} unterbrochene${betroffen.length === 1 ? 'r' : ''} WBW-Lauf als abgebrochen vermerkt.`,
    )
  }
}

async function raeumeMeldungenAuf(sql) {
  // Gelesenes verfaellt nach 30 Tagen. Ungelesenes bleibt stehen, egal wie
  // alt: wer drei Wochen weg war, soll beim Wiederkommen sehen, was in der
  // Zeit gescheitert ist.
  const weg = await sql`
    delete from meldung
     where gelesen_am is not null
       and erstellt_am < now() - interval '30 days'
    returning id
  `
  if (weg.length > 0) melde(`${weg.length} gelesene Meldungen aelter als 30 Tage entfernt.`)
}

function richteKleinanzeigenEin() {
  if (process.env.KA_API_BASE) {
    melde(`Kleinanzeigen-Beschaffung über ${process.env.KA_API_BASE}.`)
    return
  }
  const port = process.env.PORT ?? '3000'
  process.env.KA_API_BASE = `http://127.0.0.1:${port}/api/kleinanzeigen`
  if (!process.env.KA_API_USER || !process.env.KA_API_PASS) {
    // Ein Wort, das nur dieser Prozess kennt: das Plugin läuft als Kindprozess
    // und erbt es, von aussen ist es nicht zu erraten und nirgends abgelegt.
    process.env.KA_API_USER = 'cockpit'
    process.env.KA_API_PASS = randomBytes(24).toString('hex')
  }
  melde('Kleinanzeigen-Beschaffung läuft über die Anwendung selbst.')
}

/**
 * Sagt beim Hochfahren, ob ein Browser für die Belege da ist.
 *
 * Am 08.09.2026 fiel das Fehlen erst auf, nachdem eine WBW-Recherche
 * durchgelaufen war und die Belege in den Gutachtenordner sollten — mit einer
 * Meldung, die auf `google-chrome-stable` zeigte, den niemand eingerichtet
 * hat. Beim Start kostet die Auskunft eine Zeile.
 */
function meldeDrucker() {
  const kandidaten = [
    process.env.WBW_CHROME,
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/lib/chromium/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean)

  for (const pfad of kandidaten) {
    try {
      accessSync(pfad, constants.X_OK)
      melde(`Belegdruck über ${pfad}.`)
      return
    } catch {
      // nächster
    }
  }
  console.warn(
    '[start] Kein Browser gefunden — Belege lassen sich nicht als PDF drucken. ' +
      `Gesucht unter: ${kandidaten.join(', ') || '— nichts gesetzt —'}.`,
  )
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[start] DATABASE_URL fehlt. Der Server wird nicht gestartet.')
    process.exit(1)
  }

  const sql = postgres(url, { max: 2, onnotice: () => {} })
  try {
    await wendeMigrationenAn(sql)
    await befuelleBibliothek(sql)
    await befuelleFotolexikon(sql)
    await legeErstenZugangAn(sql)
    await raeumeWbwLaeufeAuf(sql)
    await raeumeMeldungenAuf(sql)
  } catch (fehler) {
    console.error('[start] Einrichtung fehlgeschlagen:', fehler)
    process.exit(1)
  } finally {
    await sql.end({ timeout: 5 })
  }

  richteKleinanzeigenEin()
  meldeDrucker()

  // Der Next-Server liegt im Abbild neben diesem Skript im Arbeitsverzeichnis.
  // Die Auflösung geht bewusst über das Arbeitsverzeichnis und nicht relativ
  // zum Modul, damit der Ablageort des Skripts frei bleibt.
  const server = join(WURZEL, 'server.js')
  if (!existsSync(server)) {
    console.error(`[start] server.js nicht gefunden unter ${server}.`)
    process.exit(1)
  }

  melde('Server wird gestartet.')
  await import(pathToFileURL(server).href)
}

main()
