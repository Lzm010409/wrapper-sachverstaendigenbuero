import { describe, expect, it } from "vitest";
import { monetaryValue } from "@/pipedrive/client";

describe("monetaryValue", () => {
  it("liest Geldfelder in beiden Schreibweisen", () => {
    expect(monetaryValue(1234.5)).toBe(1234.5);
    expect(monetaryValue({ value: 99, currency: "EUR" })).toBe(99);
    expect(monetaryValue(undefined)).toBeUndefined();
    expect(monetaryValue({ currency: "EUR" })).toBeUndefined();
  });
});
