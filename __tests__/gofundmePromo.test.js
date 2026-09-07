import {
  slotIndex,
  dueGofundmePromo,
  pickAngle,
  pickStoryText,
  pickPostText,
} from "../src/gofundmePromo.js";

describe("dueGofundmePromo", () => {
  test("mercoledì dalle 18 (ora italiana, CEST) → data del giorno", () => {
    expect(dueGofundmePromo(new Date("2026-09-09T16:30:00Z"), null)).toBe("2026-09-09");
  });

  test("sabato dalle 18 (ora italiana) → data del giorno", () => {
    expect(dueGofundmePromo(new Date("2026-09-12T17:00:00Z"), null)).toBe("2026-09-12");
  });

  test("ancora attivo più tardi in serata", () => {
    expect(dueGofundmePromo(new Date("2026-09-12T21:45:00Z"), null)).toBe("2026-09-12");
  });

  test("null prima delle 18 (ora italiana)", () => {
    expect(dueGofundmePromo(new Date("2026-09-09T15:00:00Z"), null)).toBeNull();
  });

  test("null di giovedì (sfasato di 1 giorno dal calendario, non lo stesso)", () => {
    expect(dueGofundmePromo(new Date("2026-09-10T18:00:00Z"), null)).toBeNull();
  });

  test("null di martedì e venerdì (sono i giorni del calendario)", () => {
    expect(dueGofundmePromo(new Date("2026-09-08T18:00:00Z"), null)).toBeNull();
    expect(dueGofundmePromo(new Date("2026-09-11T18:00:00Z"), null)).toBeNull();
  });

  test("null se quel giorno è già stato fatto", () => {
    expect(dueGofundmePromo(new Date("2026-09-09T16:30:00Z"), "2026-09-09")).toBeNull();
  });

  test("funziona anche in ora solare (CET, +1)", () => {
    expect(dueGofundmePromo(new Date("2026-12-02T17:30:00Z"), null)).toBe("2026-12-02");
    expect(dueGofundmePromo(new Date("2026-12-02T16:30:00Z"), null)).toBeNull();
  });
});

describe("rotazione dei contenuti", () => {
  test("slotIndex cresce di 1 al giorno", () => {
    expect(slotIndex("2026-09-12") - slotIndex("2026-09-09")).toBe(3);
  });

  test("due uscite consecutive (mer → sab) usano testi diversi", () => {
    expect(pickStoryText("2026-09-09")).not.toBe(pickStoryText("2026-09-12"));
    expect(pickAngle("2026-09-09")).not.toBe(pickAngle("2026-09-12"));
  });

  test("è deterministico per la stessa data", () => {
    expect(pickAngle("2026-09-19")).toBe(pickAngle("2026-09-19"));
  });

  test("non cita mai la detrazione fiscale (è GoFundMe)", () => {
    for (const d of ["2026-09-09", "2026-09-12", "2026-09-16", "2026-09-19"]) {
      expect(pickStoryText(d).toLowerCase()).not.toMatch(/35%|detra|netti/);
      expect(pickPostText(d).toLowerCase()).not.toMatch(/35%|detra|netti/);
    }
  });
});

describe("testi delle slide", () => {
  test("le righe stanno entro ~22 caratteri", () => {
    for (const d of ["2026-09-09", "2026-09-12", "2026-09-16", "2026-09-19"]) {
      for (const line of pickStoryText(d).split("\n")) {
        expect(line.length).toBeLessThanOrEqual(22);
      }
      for (const line of pickPostText(d).split("\n")) {
        expect(line.length).toBeLessThanOrEqual(22);
      }
    }
  });

  test("ogni variante cita l'obiettivo 4.500€", () => {
    for (const t of ["2026-09-09", "2026-09-12", "2026-09-16", "2026-09-19"]) {
      expect(pickStoryText(t)).toMatch(/4\.500/);
    }
  });
});
