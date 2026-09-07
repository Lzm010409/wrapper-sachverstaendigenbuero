import { describe, expect, it } from "vitest";
import type { Gutachten } from "@/autoixpert/typen";
import {
  fehlendeAngaben,
  parseAusstattung,
  reportToWbwParams,
  toEzMonat,
} from "@/wbw/params";

const report: Gutachten = {
  id: "r1",
  type: "liability",
  state: "recorded",
  claimant: { zip: "47798" },
  car: {
    make: "VW",
    model: "Tiguan",
    first_registration_date: "2021-07-15",
    mileage_meter: 65000,
    mileage_as_stated: 64000,
    mileage_estimated: 60000,
    performance_kw: 110,
  },
};

describe("toEzMonat", () => {
  it("macht aus einem ISO-Datum MM/JJJJ", () => {
    expect(toEzMonat("2021-07-15")).toBe("07/2021");
  });

  it("liefert leeren Text ohne Datum", () => {
    expect(toEzMonat(undefined)).toBe("");
    expect(toEzMonat("keins")).toBe("");
  });
});

describe("parseAusstattung", () => {
  it("zerlegt an Kommas und Zeilenumbruechen und wirft Leeres weg", () => {
    expect(parseAusstattung("Klimaautomatik, Sitzheizung,\n Navigation , ")).toEqual([
      "Klimaautomatik",
      "Sitzheizung",
      "Navigation",
    ]);
  });
});

describe("reportToWbwParams", () => {
  it("uebernimmt Fahrzeugdaten und die PLZ des Anspruchstellers", () => {
    const params = reportToWbwParams(report);
    expect(params.subject).toMatchObject({
      marke: "VW",
      modell: "Tiguan",
      ez: "07/2021",
      power: 110,
    });
    expect(params.plz).toBe("47798");
  });

  it("nimmt die abgelesene Laufleistung vor der angegebenen und der geschaetzten", () => {
    expect(reportToWbwParams(report).subject.mileage).toBe(65000);
    const ohneAblesung = { ...report, car: { ...report.car, mileage_meter: undefined } };
    expect(reportToWbwParams(ohneAblesung).subject.mileage).toBe(64000);
  });

  it("laesst das Getriebe weg, wenn 'egal' gewaehlt wurde", () => {
    expect(reportToWbwParams(report, { getriebe: "egal" }).getriebe).toBeUndefined();
    expect(reportToWbwParams(report, { getriebe: "Automatik" }).getriebe).toBe("Automatik");
  });

  it("setzt die Voreinstellungen des Skills", () => {
    const params = reportToWbwParams(report);
    expect(params.radiusKm).toBe(200);
    expect(params.kmToleranz).toBe(25000);
    expect(params.ezToleranzJahre).toBe(1);
    expect(params.leistungToleranzKw).toBe(10);
    expect(params.wbwOpts).toEqual({ eurProKm: 0.1, eurProEzMonat: 120 });
  });
});

describe("fehlendeAngaben", () => {
  it("meldet die fehlende Variante", () => {
    expect(fehlendeAngaben(reportToWbwParams(report))).toEqual([
      "Variante bzw. Ausstattungslinie",
    ]);
  });

  it("meldet nichts, wenn alle Pflichtangaben da sind", () => {
    const params = reportToWbwParams(report, { variante: "2.0 TDI Highline" });
    expect(fehlendeAngaben(params)).toEqual([]);
  });
});
