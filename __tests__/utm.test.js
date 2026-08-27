import { addUtmParams, slugify, todayStamp } from "../src/utm.js";

describe("addUtmParams", () => {
  test("aggiunge i parametri UTM a un link effataitalia.it", () => {
    const out = addUtmParams("https://effataitalia.it/adotta-ora/", {
      source: "facebook",
      campaign: "Adozioni scolastiche",
      content: "2026-08-27",
    });
    const url = new URL(out);
    expect(url.searchParams.get("utm_source")).toBe("facebook");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("adozioni-scolastiche");
    expect(url.searchParams.get("utm_content")).toBe("2026-08-27");
  });

  test("gestisce il sottodominio www", () => {
    const out = addUtmParams("https://www.effataitalia.it/", { source: "linkedin" });
    expect(out).toContain("utm_source=linkedin");
  });

  test("lascia intatti gli URL di domini esterni", () => {
    const external = "https://www.gofundme.com/f/qualcosa";
    expect(addUtmParams(external, { source: "facebook", campaign: "x" })).toBe(external);
  });

  test("preserva i parametri di query già presenti nel link", () => {
    const out = addUtmParams("https://effataitalia.it/salute-e-disabilita/?ref=abc", {
      source: "facebook",
    });
    const url = new URL(out);
    expect(url.searchParams.get("ref")).toBe("abc");
    expect(url.searchParams.get("utm_source")).toBe("facebook");
  });

  test("ritorna il valore originale se l'URL non è valido o è vuoto", () => {
    expect(addUtmParams("", { source: "facebook" })).toBe("");
    expect(addUtmParams("non-un-url", { source: "facebook" })).toBe("non-un-url");
    expect(addUtmParams(null, { source: "facebook" })).toBe(null);
  });

  test("omette i parametri non forniti (nessun campaign/content)", () => {
    const out = addUtmParams("https://effataitalia.it/", { source: "facebook" });
    expect(out).not.toContain("utm_campaign");
    expect(out).not.toContain("utm_content");
  });
});

describe("slugify", () => {
  test("normalizza accenti, maiuscole, parentesi e spazi", () => {
    expect(slugify("Aiuti sanitari (Carozzine)")).toBe("aiuti-sanitari-carozzine");
    expect(slugify("Adozioni in casa famiglia")).toBe("adozioni-in-casa-famiglia");
  });

  test("gestisce input vuoto/nullo", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
  });
});

describe("todayStamp", () => {
  test("formatta la data come YYYY-MM-DD", () => {
    expect(todayStamp(new Date("2026-08-27T15:30:00Z"))).toBe("2026-08-27");
  });
});
