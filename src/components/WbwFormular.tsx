"use client";

import { useMemo, useState } from "react";
import { Card, Field } from "@/components/ui";
import type { Report } from "@/lib/autoixpert/types";
import {
  fehlendeAngaben,
  reportToWbwParams,
  type WbwEingaben,
} from "@/lib/wbw/params";
import { formatKilometers } from "@/lib/format";

/**
 * Eingabemaske fuer die WBW-Recherche. Die Fahrzeugdaten kommen aus dem Gutachten,
 * ergaenzt werden nur die Angaben, die autoiXpert nicht kennt (Ausstattungslinie,
 * Soll-Ausstattung, Suchzentrum, Toleranzen).
 *
 * Der Recherchelauf selbst laeuft noch nicht - er braucht den Job-Dienst und die
 * Portal-Zugangsdaten. Bis dahin erzeugt die Maske die fertige params.json, die
 * das Plugin unveraendert entgegennimmt.
 */
export function WbwFormular({ report }: { report: Report }) {
  const [eingaben, setEingaben] = useState<WbwEingaben>({});

  const params = useMemo(() => reportToWbwParams(report, eingaben), [report, eingaben]);
  const fehlt = fehlendeAngaben(params);

  function setze<K extends keyof WbwEingaben>(key: K, value: WbwEingaben[K]) {
    setEingaben((alt) => ({ ...alt, [key]: value }));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Suchparameter">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hersteller" value={params.subject.marke} />
            <Field label="Modell" value={params.subject.modell} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Erstzulassung" value={params.subject.ez} />
            <Field
              label="Laufleistung"
              value={
                params.subject.mileage
                  ? formatKilometers(params.subject.mileage)
                  : undefined
              }
            />
          </div>
          <Field
            label="Leistung (kW)"
            value={params.subject.power ?? undefined}
          />

          <div>
            <label className="block text-[11px] leading-4 text-ax-label" htmlFor="variante">
              Variante / Ausstattungslinie (z. B. „2.0 TDI Highline“)
            </label>
            <input
              id="variante"
              className="ax-field-input"
              value={eingaben.variante ?? ""}
              onChange={(event) => setze("variante", event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] leading-4 text-ax-label" htmlFor="plz">
                Zentrum-PLZ
              </label>
              <input
                id="plz"
                inputMode="numeric"
                className="ax-field-input"
                value={eingaben.plz ?? params.plz}
                onChange={(event) => setze("plz", event.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] leading-4 text-ax-label" htmlFor="getriebe">
                Getriebe
              </label>
              <select
                id="getriebe"
                className="ax-field-input"
                value={eingaben.getriebe ?? "egal"}
                onChange={(event) =>
                  setze("getriebe", event.target.value as WbwEingaben["getriebe"])
                }
              >
                <option value="egal">egal</option>
                <option value="Automatik">Automatik</option>
                <option value="Manuell">Manuell</option>
              </select>
            </div>
          </div>

          <div>
            <label
              className="block text-[11px] leading-4 text-ax-label"
              htmlFor="ausstattung"
            >
              Soll-Ausstattung, mit Komma getrennt
            </label>
            <textarea
              id="ausstattung"
              rows={2}
              className="ax-field-input resize-y"
              placeholder="Klimaautomatik, Sitzheizung, Panoramadach"
              value={eingaben.sollAusstattung ?? ""}
              onChange={(event) => setze("sollAusstattung", event.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] leading-4 text-ax-label" htmlFor="radius">
                Radius (km)
              </label>
              <input
                id="radius"
                type="number"
                className="ax-field-input"
                value={eingaben.radiusKm ?? 200}
                onChange={(event) => setze("radiusKm", Number(event.target.value))}
              />
            </div>
            <div>
              <label className="block text-[11px] leading-4 text-ax-label" htmlFor="kmtol">
                km-Toleranz
              </label>
              <input
                id="kmtol"
                type="number"
                step={1000}
                className="ax-field-input"
                value={eingaben.kmToleranz ?? 25000}
                onChange={(event) => setze("kmToleranz", Number(event.target.value))}
              />
            </div>
            <div>
              <label className="block text-[11px] leading-4 text-ax-label" htmlFor="proportal">
                Treffer je Portal
              </label>
              <input
                id="proportal"
                type="number"
                className="ax-field-input"
                value={eingaben.maxItemsProPortal ?? 40}
                onChange={(event) => setze("maxItemsProPortal", Number(event.target.value))}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Eingabedatei params.json">
        {fehlt.length > 0 ? (
          <p className="mb-4 rounded-ax border-l-4 border-ax-warn bg-ax-surface-muted px-3 py-2 text-sm text-ax-text-soft">
            Es fehlen noch: {fehlt.join(", ")}. Ohne diese Angaben wird der
            Vergleichskorb beliebig.
          </p>
        ) : (
          <p className="mb-4 rounded-ax border-l-4 border-ax-value bg-ax-surface-muted px-3 py-2 text-sm text-ax-text-soft">
            Alle Pflichtangaben sind gesetzt.
          </p>
        )}

        <pre className="max-h-96 overflow-auto rounded-ax bg-ax-surface-muted p-3 text-xs leading-relaxed text-ax-text">
          {JSON.stringify(params, null, 2)}
        </pre>

        <p className="mt-4 text-xs text-ax-label">
          Der Recherchelauf über mobile.de, AutoScout24 und Kleinanzeigen ist noch nicht
          angeschlossen — dafür fehlen der Job-Dienst und die Portal-Zugangsdaten in
          dieser Umgebung. Diese Datei nimmt das Plugin unverändert entgegen.
        </p>
      </Card>
    </div>
  );
}
