import { describe, expect, it } from "vitest";
import { contactName, formatEuro, formatKilometers, werktageSeit } from "@/lib/format";

describe("werktageSeit", () => {
  it("zaehlt nur Werktage", () => {
    // Mo 01.09.2026 bis Mo 08.09.2026: fuenf Werktage, Wochenende faellt raus.
    expect(werktageSeit("2026-09-01", "2026-09-08")).toBe(5);
  });

  it("liefert 0 am selben Tag", () => {
    expect(werktageSeit("2026-09-07", "2026-09-07")).toBe(0);
  });

  it("liefert 0 bei einem Datum in der Zukunft", () => {
    expect(werktageSeit("2026-09-20", "2026-09-07")).toBe(0);
  });

  it("faellt bei unbrauchbarer Eingabe auf 0 zurueck", () => {
    expect(werktageSeit("nicht-datum", "2026-09-07")).toBe(0);
  });
});

describe("contactName", () => {
  it("bevorzugt die Firma", () => {
    expect(contactName({ organization_name: "Muster GmbH", last_name: "Muster" })).toBe(
      "Muster GmbH",
    );
  });

  it("setzt Vor- und Nachname zusammen", () => {
    expect(contactName({ first_name: "Anna", last_name: "Muster" })).toBe("Anna Muster");
  });

  it("zeigt einen Platzhalter, wenn nichts da ist", () => {
    expect(contactName(undefined)).toBe("—");
    expect(contactName({})).toBe("—");
  });
});

describe("Zahlenformate", () => {
  it("formatiert Euro deutsch", () => {
    expect(formatEuro(8490.71).replace(/ /g, " ")).toBe("8.490,71 €");
  });

  it("zeigt einen Gedankenstrich statt undefined", () => {
    expect(formatEuro(undefined)).toBe("—");
    expect(formatKilometers(undefined)).toBe("—");
  });

  it("formatiert Laufleistungen mit Einheit", () => {
    expect(formatKilometers(122000)).toBe("122.000 km");
  });
});
