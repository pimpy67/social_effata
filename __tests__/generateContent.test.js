describe("generateSocialContent", () => {
  test("è una funzione esportata", async () => {
    const { generateSocialContent } = await import("../src/generateContent.js");
    expect(typeof generateSocialContent).toBe("function");
  });

  test("accetta testo e foto come parametri", async () => {
    const { generateSocialContent } = await import("../src/generateContent.js");
    expect(generateSocialContent.length).toBeGreaterThanOrEqual(1);
  });
});
