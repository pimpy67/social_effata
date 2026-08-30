import { validation } from "../src/validation.js";

describe("validation.validatePhoto", () => {
  test("accetta formati supportati", () => {
    expect(validation.validatePhoto("image/jpeg", 1000000).valid).toBe(true);
    expect(validation.validatePhoto("image/png", 1000000).valid).toBe(true);
    expect(validation.validatePhoto("image/webp", 1000000).valid).toBe(true);
    expect(validation.validatePhoto("image/gif", 1000000).valid).toBe(true);
  });

  test("rifiuta formati non supportati", () => {
    const result = validation.validatePhoto("image/bmp", 1000000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("non supportato");
  });

  test("rifiuta file troppo grandi", () => {
    const result = validation.validatePhoto("image/jpeg", 30 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("troppo grande");
  });

  test("accetta file nel limite", () => {
    const result = validation.validatePhoto("image/jpeg", 25 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });
});

describe("validation.validatePhotoCount", () => {
  test("accetta foto sotto il limite", () => {
    expect(validation.validatePhotoCount(0).valid).toBe(true);
    expect(validation.validatePhotoCount(5).valid).toBe(true);
    expect(validation.validatePhotoCount(9).valid).toBe(true);
  });

  test("rifiuta foto al limite", () => {
    const result = validation.validatePhotoCount(10);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Limite");
  });
});

describe("validation.validateTextMessage", () => {
  test("accetta messaggi validi", () => {
    expect(validation.validateTextMessage("Ciao").valid).toBe(true);
    expect(validation.validateTextMessage("A".repeat(5000)).valid).toBe(true);
  });

  test("rifiuta messaggi vuoti", () => {
    expect(validation.validateTextMessage("").valid).toBe(false);
    expect(validation.validateTextMessage("   ").valid).toBe(false);
  });

  test("rifiuta messaggi troppo lunghi", () => {
    const result = validation.validateTextMessage("A".repeat(6000));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("troppo lungo");
  });
});

describe("validation.validateTotalTextLength", () => {
  test("accetta testo sotto il limite", () => {
    const captions = ["Foto 1", "Foto 2"];
    const notes = ["Nota 1"];
    const result = validation.validateTotalTextLength(captions, notes);
    expect(result.valid).toBe(true);
  });

  test("rifiuta testo sopra il limite", () => {
    const captions = ["A".repeat(30000)];
    const notes = ["A".repeat(25000)];
    const result = validation.validateTotalTextLength(captions, notes);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("troppo lungo");
  });
});

describe("validation.validateGenerateCooldown", () => {
  test("consente primo /genera", () => {
    const result = validation.validateGenerateCooldown(12345);
    expect(result.valid).toBe(true);
  });

  test("rifiuta /genera troppo rapido", (done) => {
    const chatId = 54321;
    validation.validateGenerateCooldown(chatId); // primo

    const result = validation.validateGenerateCooldown(chatId); // secondo subito dopo
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Aspetta");

    // Ripulisci
    validation.resetGenerateCooldown(chatId);
    done();
  });

  test("permette /genera dopo cooldown", (done) => {
    const chatId = 99999;
    validation.validateGenerateCooldown(chatId);

    setTimeout(() => {
      const result = validation.validateGenerateCooldown(chatId);
      expect(result.valid).toBe(true);
      validation.resetGenerateCooldown(chatId);
      done();
    }, 31000); // 31 secondi
  }, 35000); // timeout del test
});

describe("validation.validateMaterialForGenerate", () => {
  test("accetta con foto", () => {
    expect(validation.validateMaterialForGenerate(1, 0).valid).toBe(true);
    expect(validation.validateMaterialForGenerate(5, 3).valid).toBe(true);
  });

  test("accetta con solo video (senza foto)", () => {
    expect(validation.validateMaterialForGenerate(0, 0, 1).valid).toBe(true);
    expect(validation.validateMaterialForGenerate(0, 2, 1).valid).toBe(true);
  });

  test("rifiuta senza foto né video", () => {
    const result = validation.validateMaterialForGenerate(0, 5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Nessuna foto");
  });

  test("rifiuta senza materiale", () => {
    const result = validation.validateMaterialForGenerate(0, 0, 0);
    expect(result.valid).toBe(false);
  });
});

describe("validation.validateDownloadSize", () => {
  test("accetta file sotto il limite", () => {
    expect(validation.validateDownloadSize(10 * 1024 * 1024).valid).toBe(true);
  });

  test("rifiuta file troppo grande", () => {
    const result = validation.validateDownloadSize(30 * 1024 * 1024);
    expect(result.valid).toBe(false);
  });

  test("accetta assenza di content-length", () => {
    expect(validation.validateDownloadSize(null).valid).toBe(true);
  });
});

describe("validation.getLimits", () => {
  test("ritorna configurazione limiti", () => {
    const limits = validation.getLimits();
    expect(limits.MAX_FILE_SIZE_MB).toBe(25);
    expect(limits.MAX_TOTAL_PHOTOS).toBe(10);
    expect(limits.MAX_TEXT_LENGTH).toBe(50000);
    expect(limits.GENERATE_COOLDOWN_SECONDS).toBe(30);
  });
});
