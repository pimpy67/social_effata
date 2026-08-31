import {
  getRomeParts,
  monthKeyOf,
  dueSummaryMonth,
  buildSummaryImageText,
  buildReportDigest,
  summaryActivityCount,
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
  test("include il mese in maiuscolo e una frase di gratitudine, nessun numero", () => {
    const text = buildSummaryImageText({ monthName: "agosto 2026", details: [] });
    expect(text).toContain("AGOSTO 2026");
    expect(text).toMatch(/grazie/i);
    expect(text).not.toMatch(/aiut|storia|storie/i);
  });
});

describe("summaryActivityCount", () => {
  test("somma i numeri principali per categoria (bambini, carrozzine, opere)", () => {
    const n = summaryActivityCount({
      details: [
        { categoryNumber: "1", category: "Adozioni scolastiche", data: { sponsors: [{ childName: "Amina" }, { childName: "Rose" }] } },
        { categoryNumber: "1", category: "Adozioni scolastiche", data: { childName: "Divine" } },
        { categoryNumber: "3", category: "Aiuti sanitari (Carozzine)", data: { wheelchairCount: "3" } },
        { categoryNumber: "4", category: "Costruzione casette", data: {} },
      ],
    });
    expect(n).toBe(3 + 3 + 1);
  });

  test("non conta Vari né Volontariato Digitale", () => {
    const n = summaryActivityCount({
      details: [
        { categoryNumber: "1", category: "Adozioni scolastiche", data: { childName: "Amina" } },
        { categoryNumber: "10", category: "Vari", data: {} },
        { categoryNumber: "11", category: "Volontariato Digitale", data: {} },
        { categoryNumber: "12", category: "Grazie Volontari Digitali", data: {} },
      ],
    });
    expect(n).toBe(1);
  });
});

describe("buildReportDigest", () => {
  test("elenca le attività per categoria con nomi e conteggi, senza parlare di storie/post", () => {
    const digest = buildReportDigest({
      monthName: "agosto 2026",
      details: [
        {
          categoryNumber: "1",
          category: "Adozioni scolastiche",
          data: { sponsors: [{ childName: "Amina" }, { childName: "Rose Marie" }] },
        },
        { categoryNumber: "1", category: "Adozioni scolastiche", data: { childName: "Divine" } },
        {
          categoryNumber: "3",
          category: "Aiuti sanitari (Carozzine)",
          data: { wheelchairCount: "3", childrenNames: "Patrick e Lydia" },
        },
      ],
    });
    expect(digest).not.toMatch(/stori[ae]|\bpost\b/i);
    expect(digest).toContain("Adozioni scolastiche: 3");
    expect(digest).toContain("Amina, Rose, Divine");
    expect(digest).toContain("Aiuti sanitari (Carozzine): 3");
    expect(digest).toContain("Patrick e Lydia");
  });

  test("esclude Vari e Volontariato Digitale dal digest", () => {
    const digest = buildReportDigest({
      monthName: "agosto 2026",
      details: [
        { categoryNumber: "4", category: "Costruzione casette", data: { familyName: "Famiglia Okello" } },
        { categoryNumber: "11", category: "Volontariato Digitale", data: {} },
        { categoryNumber: "10", category: "Vari", data: {} },
      ],
    });
    expect(digest).toContain("Costruzione casette: 1");
    expect(digest).toContain("Famiglia Okello");
    expect(digest).not.toContain("Volontariato Digitale");
    expect(digest).not.toContain("Vari");
  });

  test("categoria senza campi extra: solo il conteggio", () => {
    const digest = buildReportDigest({
      monthName: "luglio 2026",
      details: [{ categoryNumber: "4", category: "Costruzione casette", data: {} }],
    });
    expect(digest).toContain("Costruzione casette: 1");
  });
});
