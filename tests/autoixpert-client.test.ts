import { describe, expect, it } from "vitest";
import { extractPage } from "@/lib/autoixpert/client";
import { monetaryValue } from "@/lib/pipedrive/client";

describe("extractPage", () => {
  it("findet das Datenarray unabhaengig von seinem Namen", () => {
    // Die Doku nennt das Array je Endpunkt anders - im Beispiel zu GET /reports
    // steht sogar "contacts". Deshalb darf der Name nicht fest verdrahtet sein.
    const page = extractPage<{ id: string }>({
      contacts: [{ id: "a" }],
      has_more: true,
      next_page: "CKAoGgkpcPMwVXkBAAA=",
    });
    expect(page.items).toEqual([{ id: "a" }]);
    expect(page.has_more).toBe(true);
    expect(page.next_page).toBe("CKAoGgkpcPMwVXkBAAA=");
  });

  it("kommt mit einer leeren Antwort zurecht", () => {
    const page = extractPage({});
    expect(page.items).toEqual([]);
    expect(page.has_more).toBe(false);
    expect(page.next_page).toBeUndefined();
  });
});

describe("monetaryValue", () => {
  it("liest Geldfelder in beiden Schreibweisen", () => {
    expect(monetaryValue(1234.5)).toBe(1234.5);
    expect(monetaryValue({ value: 99, currency: "EUR" })).toBe(99);
    expect(monetaryValue(undefined)).toBeUndefined();
    expect(monetaryValue({ currency: "EUR" })).toBeUndefined();
  });
});
