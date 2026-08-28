import { MetaAPI, getMp4VideoDimensions } from "../src/metaAPI.js";

describe("MetaAPI — statistiche engagement", () => {
  test("getFacebookPostStats fallisce senza credenziali", async () => {
    const res = await new MetaAPI("", "").getFacebookPostStats();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/credenziali/i);
  });

  test("getInstagramMediaStats fallisce senza account IG collegato", async () => {
    // token presente ma instagramAccountId resta null finché initialize() non gira
    const res = await new MetaAPI("tok", "123").getInstagramMediaStats();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/instagram/i);
  });
});

describe("getMp4VideoDimensions", () => {
  test("ritorna null su buffer non valido invece di lanciare", () => {
    expect(getMp4VideoDimensions(Buffer.from("non un mp4"))).toBeNull();
  });
});
