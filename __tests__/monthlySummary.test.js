import {
  getRomeParts,
  monthKeyOf,
  dueSummaryMonth,
  buildSummaryImageText,
  buildReportDigest,
} from "../src/monthlySummary.js";

describe("getRomeParts", () => {
  test("converte un istante UTC nell'ora legale italiana (CEST, +2)", () => {
    const p = getRomeParts(new Date("2026-08-31T19:30:00Z"));
    expect(p).toMatchObject({ year: 2026, month: 8, day: 31, hour: 21 });
  });

  test("converte un istante UTC nell'ora solare italiana (CET, +1)", () => {
    const p = getRomeParts(new Date("2026-11-30T20:30:00Z"));
    expect(p).toMatchObject({ year: 2026, month: 11, day: 30, hour: 21 });
  });
});

describe("monthKeyOf", () => {
  test("azzera-padding del mese", () => {
    expect(monthKeyOf({ year: 2026, month: 8 })).toBe("2026-08");
    expect(monthKeyOf({ year: 2026, month: 12 })).toBe("2026-12");
  });
});

describe("dueSummaryMonth", () => {
  test("ritorna il mese corrente l'ultimo giorno dalle 21 (ora italiana)", () => {
    expect(dueSummaryMonth(new Date("2026-08-31T19:30:00Z"), null)).toBe("2026-08");
  });

  test("ancora attivo più tardi in serata (23:45 ora italiana)", () => {
    expect(dueSummaryMonth(new Date("2026-08-31T21:45:00Z"), null)).toBe("2026-08");
  });

  test("null prima delle 21", () => {
    expect(dueSummaryMonth(new Date("2026-08-31T17:00:00Z"), null)).toBeNull();
  });

  test("null se non è né l'ultimo giorno né il 1°", () => {
    expect(dueSummaryMonth(new Date("2026-08-30T19:30:00Z"), null)).toBeNull();
  });

  test("null se il riepilogo di quel mese è già stato preparato", () => {
    expect(dueSummaryMonth(new Date("2026-08-31T19:30:00Z"), "2026-08")).toBeNull();
  });

  test("recupero: il 1° del mese riepiloga il mese precedente", () => {
    expect(dueSummaryMonth(new Date("2026-09-01T08:00:00Z"), null)).toBe("2026-08");
  });

  test("recupero di gennaio riepiloga dicembre dell'anno prima", () => {
    expect(dueSummaryMonth(new Date("2027-01-01T08:00:00Z"), null)).toBe("2026-12");
  });

  test("gestisce febbraio (28 giorni nel 2026)", () => {
    expect(dueSummaryMonth(new Date("2026-02-28T20:30:00Z"), null)).toBe("2026-02");
    expect(dueSummaryMonth(new Date("2026-02-27T20:30:00Z"), null)).toBeNull();
  });
});

describe("buildSummaryImageText", () => {
  test("include mese in maiuscolo e totale", () => {
    const text = buildSummaryImageText({ monthName: "agosto 2026", total: 12 });
    expect(text).toContain("AGOSTO 2026");
    expect(text).toContain("12 storie di aiuto raccontate");
  });

  test("singolare con una sola storia", () => {
    const text = buildSummaryImageText({ monthName: "agosto 2026", total: 1 });
    expect(text).toContain("1 storia di aiuto raccontata");
  });
});

describe("buildReportDigest", () => {
  test("elenca i conteggi per categoria e i nomi dei beneficiari", () => {
    const digest = buildReportDigest({
      monthName: "agosto 2026",
      total: 3,
      report: { "Adozioni scolastiche": 2, "Aiuti sanitari (Operazioni)": 1 },
      details: [
        { data: { sponsors: [{ childName: "Amina" }, { childName: "Rose Marie" }] } },
        { data: { childName: "Divine" } },
      ],
    });
    expect(digest).toContain("Totale storie pubblicate: 3");
    expect(digest).toContain("- Adozioni scolastiche: 2");
    expect(digest).toContain("- Aiuti sanitari (Operazioni): 1");
    expect(digest).toContain("Amina, Rose, Divine");
  });

  test("niente riga nomi se non ci sono childName", () => {
    const digest = buildReportDigest({
      monthName: "luglio 2026",
      total: 1,
      report: { "Costruzione casette": 1 },
      details: [{ data: {} }],
    });
    expect(digest).not.toContain("Nomi di battesimo");
  });
});
