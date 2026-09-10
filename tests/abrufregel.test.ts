import { describe, expect, it } from "vitest";
import {
  AbrufregelVerletzt,
  pflichtfilter,
  pruefeGutachten,
  pruefeSchreibzugriff,
  type Abrufregel,
} from "@/autoixpert/abrufregel";

const enge: Abrufregel = {
  nurOffene: true,
  fruehestensErstellt: "2026-05-01T00:00:00.000Z",
  schreibenErlaubt: false,
};

describe("pflichtfilter", () => {
  it("setzt beide Sperren", () => {
    expect(pflichtfilter(enge)).toEqual({
      is_open: "true",
      created_at_gte: "2026-05-01T00:00:00.000Z",
    });
  });

  it("laesst bei geloester Regel beide weg", () => {
    expect(pflichtfilter({ nurOffene: false, schreibenErlaubt: true })).toEqual({});
  });
});

describe("pruefeGutachten", () => {
  it("laesst ein offenes Gutachten ab Mai 2026 durch", () => {
    expect(() =>
      pruefeGutachten({ state: "recorded", created_at: "2026-09-06T08:00:00Z" }, enge),
    ).not.toThrow();
  });

  it("laesst ein abgeschlossenes Gutachten durch — der Abschluss ist keine Sperre mehr", () => {
    expect(() =>
      pruefeGutachten(
        { state: "locked", created_at: "2026-09-06T08:00:00Z", token: "0926/2078TG" },
        enge,
      ),
    ).not.toThrow();
  });

  it("weist ein zu altes Gutachten ab", () => {
    expect(() =>
      pruefeGutachten({ state: "recorded", created_at: "2026-04-30T23:59:00Z" }, enge),
    ).toThrow(AbrufregelVerletzt);
  });
});

describe("pruefeSchreibzugriff", () => {
  it("sperrt schreibende Zugriffe", () => {
    expect(() => pruefeSchreibzugriff("PATCH", enge)).toThrow(AbrufregelVerletzt);
  });

  it("laesst sie zu, wenn die Regel geloest ist", () => {
    expect(() =>
      pruefeSchreibzugriff("PATCH", { nurOffene: true, schreibenErlaubt: true }),
    ).not.toThrow();
  });
});
