import { describe, expect, it } from "vitest";
import {
  abrufreihenfolge,
  leseAktenzeichen,
  vergleichsform,
} from "@/autoixpert/aktenzeichen";

describe("leseAktenzeichen", () => {
  it("liest die Anzeigeform mit Schraegstrich", () => {
    expect(leseAktenzeichen("0926/2081TG")).toEqual({
      anzeige: "0926/2081TG",
      externeId: "0926_2081TG",
    });
  });

  it("liest die Form der externen ID mit Unterstrich", () => {
    expect(leseAktenzeichen("0926_2081TG")).toEqual({
      anzeige: "0926/2081TG",
      externeId: "0926_2081TG",
    });
  });

  it("schreibt das Kuerzel gross", () => {
    expect(leseAktenzeichen("0826/2069tg")?.anzeige).toBe("0826/2069TG");
  });

  it("erkennt eine technische ID nicht als Aktenzeichen", () => {
    expect(leseAktenzeichen("yNVkFbGpmWmR")).toBeNull();
  });
});

describe("abrufreihenfolge", () => {
  it("versucht die externe ID zuerst, weil nur sie in der URL erlaubt ist", () => {
    expect(abrufreihenfolge("0926/2081TG")).toEqual([
      "0926_2081TG",
      "0926/2081TG",
    ]);
  });

  it("gibt eine technische ID unveraendert weiter", () => {
    expect(abrufreihenfolge("yNVkFbGpmWmR")).toEqual(["yNVkFbGpmWmR"]);
  });
});

describe("vergleichsform", () => {
  it("ignoriert Trennzeichen und Schreibweise", () => {
    expect(vergleichsform("0926/2081TG")).toBe(vergleichsform("0926_2081tg"));
  });
});

describe("fallKennungen", () => {
  it("zeigt das Aktenzeichen, verlinkt aber ueber die externe ID", async () => {
    const { fallKennungen } = await import("@/autoixpert/aktenzeichen");
    expect(
      fallKennungen({ id: "yNVk", token: "0926/2081TG", external_id: "0926_2081TG" }),
    ).toEqual({ anzeige: "0926/2081TG", pfad: "0926_2081TG" });
  });

  it("leitet den Pfad aus dem Aktenzeichen ab, wenn die externe ID fehlt", () => {
    // Genau der Fall 0826/2069TG: nachgezogen wurde die externe ID erst spaeter.
    return import("@/autoixpert/aktenzeichen").then(({ fallKennungen }) => {
      expect(fallKennungen({ id: "abc", token: "0826/2069TG" })).toEqual({
        anzeige: "0826/2069TG",
        pfad: "0826_2069TG",
      });
    });
  });

  it("faellt auf die technische ID zurueck, wenn beides fehlt", async () => {
    const { fallKennungen } = await import("@/autoixpert/aktenzeichen");
    expect(fallKennungen({ id: "abc" })).toEqual({ anzeige: "abc", pfad: "abc" });
  });
});
