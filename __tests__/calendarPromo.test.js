import {
  slotIndex,
  dueCalendarPromo,
  pickAngle,
  pickStoryText,
  pickPostText,
} from "../src/calendarPromo.js";

describe("dueCalendarPromo", () => {
  test("martedì dalle 18 (ora italiana, CEST) → data del giorno", () => {
    // 16:30 UTC = 18:30 a Roma in ora legale
    expect(dueCalendarPromo(new Date("2026-09-08T16:30:00Z"), null)).toBe("2026-09-08");
  });

  test("venerdì dalle 18 (ora italiana) → data del giorno", () => {
    expect(dueCalendarPromo(new Date("2026-09-11T17:00:00Z"), null)).toBe("2026-09-11");
  });

  test("ancora attivo più tardi in serata", () => {
    expect(dueCalendarPromo(new Date("2026-09-11T21:45:00Z"), null)).toBe("2026-09-11");
  });

  test("null prima delle 18 (ora italiana)", () => {
    // 15:00 UTC = 17:00 a Roma
    expect(dueCalendarPromo(new Date("2026-09-08T15:00:00Z"), null)).toBeNull();
  });

  test("null di mercoledì", () => {
    expect(dueCalendarPromo(new Date("2026-09-09T18:00:00Z"), null)).toBeNull();
  });

  test("null se quel giorno è già stato fatto", () => {
    expect(dueCalendarPromo(new Date("2026-09-08T16:30:00Z"), "2026-09-08")).toBeNull();
  });

  test("funziona anche in ora solare (CET, +1)", () => {
    // 17:30 UTC = 18:30 a Roma in inverno
    expect(dueCalendarPromo(new Date("2026-12-01T17:30:00Z"), null)).toBe("2026-12-01");
    expect(dueCalendarPromo(new Date("2026-12-01T16:30:00Z"), null)).toBeNull();
  });
});

describe("rotazione dei contenuti", () => {
  test("slotIndex cresce di 1 al giorno", () => {
    expect(slotIndex("2026-09-11") - slotIndex("2026-09-08")).toBe(3);
  });

  test("due uscite consecutive (mar → ven) usano testi diversi", () => {
    expect(pickStoryText("2026-09-08")).not.toBe(pickStoryText("2026-09-11"));
    expect(pickPostText("2026-09-08")).not.toBe(pickPostText("2026-09-11"));
    expect(pickAngle("2026-09-08")).not.toBe(pickAngle("2026-09-11"));
  });

  test("è deterministico per la stessa data", () => {
    expect(pickAngle("2026-09-18")).toBe(pickAngle("2026-09-18"));
  });

  test("ritorna sempre un valore valido", () => {
    for (const d of ["2026-09-08", "2026-09-11", "2026-09-15", "2026-09-18", "2027-01-19"]) {
      expect(typeof pickAngle(d)).toBe("string");
      expect(pickStoryText(d)).toMatch(/50€/);
      expect(pickPostText(d)).toMatch(/50€/);
    }
  });
});

describe("testi delle slide", () => {
  test("le righe della Storia stanno entro ~22 caratteri (come le altre slide)", () => {
    for (const d of ["2026-09-08", "2026-09-11", "2026-09-15", "2026-09-18"]) {
      for (const line of pickStoryText(d).split("\n")) {
        expect(line.length).toBeLessThanOrEqual(22);
      }
      for (const line of pickPostText(d).split("\n")) {
        expect(line.length).toBeLessThanOrEqual(22);
      }
    }
  });
});
