import { escapeLinkedInCommentary, LinkedInAPI } from "../src/linkedinAPI.js";

describe("escapeLinkedInCommentary", () => {
  test("fa l'escape dei caratteri speciali del mini-formato", () => {
    expect(escapeLinkedInCommentary("Effatà (ODV) sostiene [progetti]")).toBe(
      "Effatà \\(ODV\\) sostiene \\[progetti\\]"
    );
    expect(escapeLinkedInCommentary("a|b {c} <d> ~e")).toBe("a\\|b \\{c\\} \\<d\\> \\~e");
  });

  test("non tocca gli hashtag", () => {
    expect(escapeLinkedInCommentary("Partnership e #CSR")).toBe("Partnership e #CSR");
  });

  test("fa l'escape del backslash", () => {
    expect(escapeLinkedInCommentary("percorso\\qui")).toBe("percorso\\\\qui");
  });

  test("gestisce input vuoto/nullo", () => {
    expect(escapeLinkedInCommentary("")).toBe("");
    expect(escapeLinkedInCommentary(null)).toBe("");
    expect(escapeLinkedInCommentary(undefined)).toBe("");
  });
});

describe("LinkedInAPI", () => {
  test("normalizza l'org id in URN completo", () => {
    expect(new LinkedInAPI("tok", "123213982").orgUrn).toBe("urn:li:organization:123213982");
    expect(new LinkedInAPI("tok", "urn:li:organization:123213982").orgUrn).toBe(
      "urn:li:organization:123213982"
    );
  });

  test("publishPost fallisce senza credenziali", async () => {
    const api = new LinkedInAPI("", "");
    const res = await api.publishPost("ciao");
    expect(res.success).toBe(false);
  });
});
