import { matchesWholeKeyword, getKeywordReplyText, findKeywordReply, keywordReplyKey, sendKeywordReply } from "../src/keywordReply.js";

const replies = {
  CASAFAMIGLIA: { enabled: true, text: "Grazie per il tuo interesse!" },
  INFO: { enabled: false, text: "Testo non approvato" },
  INFORMAZIONI: { enabled: true, text: "Testo informazioni" },
};

// Spy minimale: registra le chiamate senza dipendere da jest.fn (i test girano in ESM).
function spy(impl = () => {}) {
  const fn = (...args) => {
    fn.calls.push(args);
    return impl(...args);
  };
  fn.calls = [];
  return fn;
}

function fakeMetaAPI() {
  return {
    replyToFacebookComment: spy(async () => "reply-id"),
    replyToInstagramComment: spy(async () => "reply-id"),
  };
}

const fbComment = { platform: "facebook", commentId: "c1", postId: "p1", authorId: "u1", text: "CASAFAMIGLIA" };

describe("matchesWholeKeyword", () => {
  test("riconosce la parola intera ignorando maiuscole e punteggiatura", () => {
    expect(matchesWholeKeyword("CASAFAMIGLIA", "CASAFAMIGLIA")).toBe(true);
    expect(matchesWholeKeyword("casafamiglia!", "CASAFAMIGLIA")).toBe(true);
    expect(matchesWholeKeyword("Scrivo: info, grazie", "INFO")).toBe(true);
  });

  test("non riconosce la parola dentro un'altra parola", () => {
    expect(matchesWholeKeyword("informazioni per favore", "INFO")).toBe(false);
    expect(matchesWholeKeyword("una cura sicura", "CURA")).toBe(true);
    expect(matchesWholeKeyword("sicura", "CURA")).toBe(false);
  });
});

describe("getKeywordReplyText", () => {
  test("restituisce il testo solo se la voce è attiva", () => {
    expect(getKeywordReplyText("CASAFAMIGLIA", replies)).toBe("Grazie per il tuo interesse!");
    expect(getKeywordReplyText("INFO", replies)).toBeNull();
    expect(getKeywordReplyText("ADOTTO", replies)).toBeNull();
  });
});

describe("sendKeywordReply", () => {
  test("risponde pubblicamente su Facebook e salva lo stato", async () => {
    const metaAPI = fakeMetaAPI();
    const state = {};
    const save = spy();

    const sent = await sendKeywordReply(fbComment, metaAPI, { replies, state, save });

    expect(sent).toBe(true);
    expect(metaAPI.replyToFacebookComment.calls).toEqual([["c1", "Grazie per il tuo interesse!"]]);
    expect(save.calls).toEqual([[state]]);
    expect(state[keywordReplyKey(fbComment, "CASAFAMIGLIA")]).toBeDefined();
  });

  test("usa la risposta Instagram per i commenti Instagram", async () => {
    const metaAPI = fakeMetaAPI();
    const igComment = { platform: "instagram", commentId: "ig1", postId: "m1", authorId: "u2", text: "CASAFAMIGLIA" };

    await sendKeywordReply(igComment, metaAPI, { replies, state: {}, save: spy() });

    expect(metaAPI.replyToInstagramComment.calls).toEqual([["ig1", "Grazie per il tuo interesse!"]]);
    expect(metaAPI.replyToFacebookComment.calls).toHaveLength(0);
  });

  test("non risponde due volte alla stessa persona per lo stesso post", async () => {
    const metaAPI = fakeMetaAPI();
    const state = {};
    const opts = { replies, state, save: spy() };

    await sendKeywordReply(fbComment, metaAPI, opts);
    const second = await sendKeywordReply({ ...fbComment, commentId: "c2" }, metaAPI, opts);

    expect(second).toBe(false);
    expect(metaAPI.replyToFacebookComment.calls).toHaveLength(1);
  });

  test("non risponde se la voce è disattivata o manca l'API Meta", async () => {
    const metaAPI = fakeMetaAPI();
    const inactive = { platform: "facebook", commentId: "c3", postId: "p1", authorId: "u3", text: "info" };

    expect(await sendKeywordReply(inactive, metaAPI, { replies, state: {}, save: spy() })).toBe(false);
    expect(await sendKeywordReply(fbComment, null, { replies, state: {}, save: spy() })).toBe(false);
    expect(metaAPI.replyToFacebookComment.calls).toHaveLength(0);
  });
});

describe("findKeywordReply", () => {
  test("trova la voce attiva come parola intera, con precedenza alla più lunga", () => {
    expect(findKeywordReply("CASAFAMIGLIA", replies)).toBe("CASAFAMIGLIA");
    expect(findKeywordReply("mi serve info, grazie", replies)).toBeNull();
    expect(findKeywordReply("informazioni per favore", replies)).toBe("INFORMAZIONI");
    expect(findKeywordReply("ciao", replies)).toBeNull();
  });
});
