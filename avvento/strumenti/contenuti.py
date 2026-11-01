"""Contenuti della campagna social dell'Avvento 2026 (lancio + 1-25 dicembre).

Da qui escono piano.json (per il bot e per la generazione dei media) e testi.csv
(per l'approvazione). I testi sono bozze da approvare.
"""
import csv
import json
import os

BASE = "https://calendario.effataitalia.it/natale"
HERE = os.path.dirname(os.path.abspath(__file__))


def link(da, disegno=None):
    return f"{BASE}?disegno={disegno}&da={da}" if disegno else f"{BASE}?da={da}"


TAG_IG = "#EffataItalia #CalendarioDellAvvento #RegaloSolidale #Uganda #Natale2026"
TAG_FB = "#EffataItalia #CalendarioDellAvvento #RegaloSolidale"

REGALO_FB = ("🎁 Questo disegno si può regalare: è una gift card di Natale da 20 € che sostiene la Casa Famiglia "
             "Effatà in Uganda.")
REGALO_IG = "🎁 Questo disegno è una gift card di Natale da 20 € per la Casa Famiglia Effatà."

V = {  # versi del calendario (avvento.json)
    2: "L'Uganda è un paese assai lontano\nche ha bisogno di una nostra generosa mano",
    4: "Poiché molti bambini che vorrebbero sentirsi lieti\nnon possono farlo per mancanza di spazi sereni e quieti",
    6: "non vivono come noi in mezzo a luci e comodità\nma in piccoli villaggi con casette di fango prive di elettricità",
    8: "Non hanno strade asfaltate o marciapiedi illuminati,\ncamminano a piedi scalzi sopra arida terra e sassi acuminati",
    10: "invece di giocare come ogni fanciullo dovrebbe fare,\nsono costretti fin da piccoli a mani nude a lavorare",
    12: "Senza brontolare aiutano in casa pulendo e cucinando\ned intanto il tempo gli scivola via mai più ritornando",
    14: "non hanno videogiochi, bambole, costruzioni o macchinette\nsolo la natura e l'immaginazione di trastullarsi gli permette",
    17: "Disegnano con colori donati dalle bacche e dalla frutta\ne la creatività gioiosa gli sorride arricchendosi tutta",
    "17b": "Un giaciglio comodo spesso non hanno\ne una sua esistenza semplice conducono senza affanno.",
    20: "Grazie a Dio ci sono anime gentili come i missionari,\nche portano speranza, amore e regali vari.\nUna di queste Silvia si chiama\ne concretamente sostiene chi ama",
    22: "lo fa costruendo scuole, case, biblioteche o portandoli in ospedale,\nacquistando materassi, animali da cortile come il maiale",
    24: "Anche noi possiamo dare un nostro piccolo contributo\npoiché è importante donare a chi poco dalla vita ha avuto",
}


def q(v):
    """Verso tra virgolette su una riga"""
    return "«" + V[v].replace("\n", " ") + "»"


FOTO = "IMMAGINI/INIZI DI SILVIA/WhatsApp Image "  # sul disco Extreme SSD

giorni = []


def g(**k):
    giorni.append(k)


# ---------------------------------------------------------------- LANCIO
g(data="2026-11-29", giorno=0, tipo="lancio", titolo="Lancio · prima domenica d'Avvento",
  media="reel_lancio", disegno=None,
  facebook=("🕯️ Oggi è la prima domenica d'Avvento e vi presentiamo il nostro Calendario dell'Avvento!\n\n"
            "Dal 1° al 25 dicembre si apre una finestra al giorno. Ad accompagnarci c'è una filastrocca per l'Uganda, "
            "verso dopo verso, con i suoi disegni.\n\n"
            "Tutti i disegni si possono vedere sul sito del calendario, e ognuno diventa una bellissima gift card di Natale: "
            "un regalo solidale da 20 € che puoi dedicare a chi vuoi tu. Arriva per email o su WhatsApp, e sostiene "
            "la Casa Famiglia Effatà in Uganda.\n\n"
            f"👉 Scopri il calendario e scegli il tuo disegno: {link('fb')}\n\n"
            "Ci vediamo martedì 1° dicembre con la prima finestra ✨\n\n"
            "📩 Vuoi riceverla ogni mattina via email? Iscriviti qui: https://effataitalia.it/iscriviti/\n\n"
            f"{TAG_FB}"),
  instagram=("🕯️ Prima domenica d'Avvento: ecco il nostro Calendario dell'Avvento!\n"
             "Dal 1° al 25 dicembre una finestra al giorno, con una filastrocca per l'Uganda e i suoi disegni.\n"
             "Ogni disegno diventa una gift card di Natale: un regalo solidale da 20 € per chi vuoi tu, "
             "che sostiene la Casa Famiglia Effatà in Uganda.\n"
             "👉 Link in bio\n"
             "📩 Per ricevere ogni mattina la finestra via email: iscriviti dal link in bio\n\n"
             f"{TAG_IG}"),
  storia="Dal 1° al 25 dicembre, una finestra al giorno · Ogni disegno è una gift card · Scopri il calendario",
  link_storia=link("ig-storia"),
  email_oggetto=None,
  note="Musica carillon. Invito all'iscrizione verso effataitalia.it/iscriviti (anche nei post della prima settimana).")

# ---------------------------------------------------------------- DICEMBRE
g(data="2026-12-01", giorno=1, tipo="disegno", titolo="Mani che si incontrano · Giving Tuesday",
  media="post", disegno=1, teaser=2,
  facebook=("🕯️ Si apre la prima finestra del nostro calendario dell'Avvento!\n\n"
            "Mani d'Italia e mani d'Uganda, unite da un viaggio sopra il mare. È il primo disegno della nostra "
            f"filastrocca, e domani arriva il primo verso:\n{q(2)}\n\n"
            "Oggi è anche il Giving Tuesday, la giornata mondiale del dono: il modo giusto per cominciare.\n\n"
            f"{REGALO_FB}\n👉 {link('fb', 1)}\n\n{TAG_FB}"),
  instagram=(f"🕯️ Finestra 1. Mani d'Italia e mani d'Uganda.\nDomani il primo verso della nostra filastrocca.\n"
             f"Oggi è il Giving Tuesday, la giornata del dono 💛\n\n{REGALO_IG}\n\n{TAG_IG}"),
  storia="Finestra 1 · Regala questo disegno", link_storia=link("ig-storia", 1),
  email_oggetto="Finestra 1: mani che si incontrano 🤝")

g(data="2026-12-02", giorno=2, tipo="verso", titolo="L'Uganda è lontana", media="reel_A",
  disegno=1, foto=FOTO + "2025-11-05 at 23.26.48.jpeg", didascalia_foto="Silvia a Jinja, alle sorgenti del Nilo",
  facebook=(f"Finestra 2, il primo verso:\n{q(2)}\n\n"
            "Lontana sì, ma non per Silvia: questa è lei a Jinja, alle sorgenti del Nilo, nei suoi primi tempi in "
            "Uganda.\n\n"
            f"🎁 Il disegno di ieri, le mani d'Italia e d'Uganda, si può regalare: 20 € per la Casa Famiglia.\n"
            f"👉 {link('fb', 1)}\n\n{TAG_FB}"),
  instagram=(f"Finestra 2 🎧 Alza il volume.\n{q(2)}\n\nSilvia a Jinja, alle sorgenti del Nilo, nei suoi primi tempi in Uganda.\n\n"
             f"{REGALO_IG}\n\n{TAG_IG}"),
  storia="Finestra 2 · Ascolta il verso", link_storia=link("ig-storia", 1),
  email_oggetto="Finestra 2: «L'Uganda è un paese assai lontano…»")

g(data="2026-12-03", giorno=3, tipo="disegno", titolo="Il mondo intorno a una casa", media="post", disegno=3, teaser=4,
  facebook=("Finestra 3 🌍\nUn mondo di terra e sentieri, e in mezzo una casa: è il disegno di oggi.\n\n"
            f"Domani il verso che lo accompagna:\n{q(4)}\n\n{REGALO_FB}\n👉 {link('fb', 3)}\n\n{TAG_FB}"),
  instagram=f"Finestra 3 🌍 Un mondo di terra e sentieri, e in mezzo una casa.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 3 · Regala questo disegno", link_storia=link("ig-storia", 3),
  email_oggetto="Finestra 3: una casa in mezzo al mondo 🏡")

g(data="2026-12-04", giorno=4, tipo="verso", titolo="Spazi sereni", media="reel_A",
  disegno=3, foto=FOTO + "2025-11-05 at 23.26.47.jpeg", didascalia_foto="Silvia con i bambini, Uganda",
  facebook=(f"Finestra 4:\n{q(4)}\n\n"
            "Uno spazio sereno e quieto è proprio quello che la Casa Famiglia Effatà prova a essere ogni giorno: "
            "un posto dove stare insieme, al sicuro.\n\n"
            f"🎁 Regala il disegno di ieri: 20 € per la Casa Famiglia.\n👉 {link('fb', 3)}\n\n{TAG_FB}"),
  instagram=f"Finestra 4 🎧\n{q(4)}\n\nUno spazio sereno: è questo che vuole essere la Casa Famiglia Effatà.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 4 · Ascolta il verso", link_storia=link("ig-storia", 3),
  email_oggetto="Finestra 4: spazi sereni e quieti")

g(data="2026-12-05", giorno=5, tipo="disegno", titolo="Luci e comodità", media="post", disegno=5, teaser=6,
  facebook=("Finestra 5 🏙️\nStrade, negozi, case con il tetto rosso, una fontana in mezzo alla rotonda: "
            "il disegno di oggi racconta il nostro mondo.\n\n"
            f"Domani scoprirete perché. Il verso dice:\n{q(6)}\n\n{REGALO_FB}\n👉 {link('fb', 5)}\n\n{TAG_FB}"),
  instagram=f"Finestra 5 🏙️ Strade, negozi, una fontana: il nostro mondo, a pastello.\nDomani il verso che lo spiega.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 5 · Regala questo disegno", link_storia=link("ig-storia", 5),
  email_oggetto="Finestra 5: il nostro mondo, a pastello")

g(data="2026-12-06", giorno=6, tipo="verso", titolo="Casette di fango", media="reel_A",
  disegno=5, foto=FOTO + "2025-11-20 at 21.14.51.jpeg", didascalia_foto="Foto di Silvia, Uganda",
  facebook=(f"Finestra 6:\n{q(6)}\n\n"
            "Ieri il disegno delle nostre strade illuminate, oggi una casa di fango in un villaggio dell'Uganda, "
            "fotografata da Silvia. Due mondi, un solo calendario.\n\n"
            f"🎁 Regala il disegno di ieri: 20 € per la Casa Famiglia Effatà.\n👉 {link('fb', 5)}\n\n{TAG_FB}"),
  instagram=f"Finestra 6 🎧\n{q(6)}\n\nIeri il nostro mondo, oggi il loro. Foto di Silvia.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 6 · Ascolta il verso", link_storia=link("ig-storia", 5),
  email_oggetto="Finestra 6: casette di fango 🏠")

g(data="2026-12-07", giorno=7, tipo="disegno", titolo="Il villaggio", media="post", disegno=7, teaser=8,
  facebook=("Finestra 7 🛖\nCapanne con il tetto di paglia, palme, e sotto la terra rossa: il villaggio disegnato.\n\n"
            f"Domani, festa dell'Immacolata, il verso:\n{q(8)}\n\n{REGALO_FB}\n👉 {link('fb', 7)}\n\n{TAG_FB}"),
  instagram=f"Finestra 7 🛖 Capanne, palme e terra rossa.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 7 · Regala questo disegno", link_storia=link("ig-storia", 7),
  email_oggetto="Finestra 7: il villaggio 🛖")

g(data="2026-12-08", giorno=8, tipo="verso", titolo="A piedi scalzi · Immacolata", media="reel_B", disegno=None,
  facebook=(f"Finestra 8:\n{q(8)}\n\n"
            "Oggi è festa, e in tanti cominciano a pensare ai regali di Natale. Ecco un'idea che non si incarta: "
            "uno dei disegni della nostra filastrocca, scelto da te, che arriva per email o su WhatsApp a chi vuoi tu.\n\n"
            f"🎁 20 € per la Casa Famiglia Effatà in Uganda.\n👉 Scegli il tuo disegno: {link('fb')}\n\n{TAG_FB}"),
  instagram=f"Finestra 8 🎧\n{q(8)}\n\nOggi si comincia a pensare ai regali: scegline uno che arriva lontano.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 8 · Scegli il disegno da regalare", link_storia=link("ig-storia"),
  email_oggetto="Finestra 8: a piedi scalzi · e un'idea per i regali")

g(data="2026-12-09", giorno=9, tipo="disegno", titolo="Il sentiero", media="post", disegno=9, teaser=10,
  facebook=("Finestra 9 🌴\nUn sentiero di terra nel verde, e chi lo percorre a piedi: il disegno di oggi.\n\n"
            f"Domani il verso:\n{q(10)}\n\n{REGALO_FB}\n👉 {link('fb', 9)}\n\n{TAG_FB}"),
  instagram=f"Finestra 9 🌴 Un sentiero di terra, da fare a piedi.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 9 · Regala questo disegno", link_storia=link("ig-storia", 9),
  email_oggetto="Finestra 9: il sentiero 🌴")

g(data="2026-12-10", giorno=10, tipo="verso", titolo="Mani che lavorano", media="reel_A",
  disegno=9, foto=FOTO + "2025-11-20 at 21.05.32.jpeg", didascalia_foto="Foto di Silvia, Uganda",
  facebook=(f"Finestra 10:\n{q(10)}\n\n"
            "Le taniche gialle da riempire alla pompa e da riportare a casa: in tanti villaggi l'acqua arriva così, "
            "e spesso anche i bambini danno una mano.\n\n"
            f"🎁 Regala il disegno di ieri: 20 € per la Casa Famiglia Effatà.\n👉 {link('fb', 9)}\n\n{TAG_FB}"),
  instagram=f"Finestra 10 🎧\n{q(10)}\n\nLe taniche gialle dell'acqua, da riempire e riportare a casa.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 10 · Ascolta il verso", link_storia=link("ig-storia", 9),
  email_oggetto="Finestra 10: mani che lavorano")

g(data="2026-12-11", giorno=11, tipo="disegno", titolo="Al fiume", media="post", disegno=11, teaser=12,
  facebook=("Finestra 11 🏞️\nUn fiume, il sole che tramonta, e bambini che portano l'acqua sulla testa.\n\n"
            f"Domani il verso:\n{q(12)}\n\nE domenica è Santa Lucia: questo disegno può essere il suo regalo.\n\n"
            f"{REGALO_FB}\n👉 {link('fb', 11)}\n\n{TAG_FB}"),
  instagram=f"Finestra 11 🏞️ Il fiume, il tramonto, l'acqua portata sulla testa.\nIn tempo per Santa Lucia 🕯️\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 11 · Un regalo per Santa Lucia", link_storia=link("ig-storia", 11),
  email_oggetto="Finestra 11: al fiume 🏞️")

g(data="2026-12-12", giorno=12, tipo="verso", titolo="Senza brontolare · vigilia di Santa Lucia", media="reel_B", disegno=None,
  facebook=(f"Finestra 12:\n{q(12)}\n\n"
            "Stanotte passa Santa Lucia. Se vuoi lasciare un dono che vale due volte, scegli uno dei disegni della "
            "nostra filastrocca: arriva per email o su WhatsApp, anche all'ultimo momento.\n\n"
            f"🎁 20 € per la Casa Famiglia Effatà in Uganda.\n👉 {link('fb')}\n\n{TAG_FB}"),
  instagram=f"Finestra 12 🎧\n{q(12)}\n\nStanotte passa Santa Lucia 🕯️ Un dono che vale due volte.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 12 · Un dono per Santa Lucia", link_storia=link("ig-storia"),
  email_oggetto="Finestra 12: stanotte passa Santa Lucia 🕯️")

g(data="2026-12-13", giorno=13, tipo="disegno", titolo="In cucina · Santa Lucia", media="post", disegno=13, teaser=14,
  facebook=("Finestra 13 🍲\nIl fuoco acceso, la pentola, la scopa: dentro la casa, il lavoro di ogni giorno.\n\n"
            f"Buona Santa Lucia! Domani il verso:\n{q(14)}\n\n{REGALO_FB}\n👉 {link('fb', 13)}\n\n{TAG_FB}"),
  instagram=f"Finestra 13 🍲 Il fuoco, la pentola, la scopa. Buona Santa Lucia 🕯️\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 13 · Regala questo disegno", link_storia=link("ig-storia", 13),
  email_oggetto="Finestra 13: buona Santa Lucia 🕯️")

g(data="2026-12-14", giorno=14, tipo="verso", titolo="Natura e immaginazione", media="reel_A",
  disegno=13, foto=FOTO + "2025-11-20 at 21.01.04.jpeg", didascalia_foto="Foto di Silvia, Uganda",
  facebook=(f"Finestra 14:\n{q(14)}\n\n"
            "Pochi giocattoli e tanti sorrisi: basta guardare questa foto di Silvia per capire cosa vuol dire.\n\n"
            f"🎁 Regala il disegno di ieri: 20 € per la Casa Famiglia Effatà.\n👉 {link('fb', 13)}\n\n{TAG_FB}"),
  instagram=f"Finestra 14 🎧\n{q(14)}\n\nPochi giocattoli, tanti sorrisi. Foto di Silvia.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 14 · Ascolta il verso", link_storia=link("ig-storia", 13),
  email_oggetto="Finestra 14: natura e immaginazione")

g(data="2026-12-15", giorno=15, tipo="disegno", titolo="Due stanze, fronte e retro", media="carosello", disegno=15,
  disegni=["porta-15", "retro-15"],
  facebook=("Finestra 15: oggi i disegni sono due, fronte e retro 🔄\n"
            "Da una parte un salotto con la televisione, i giochi sul tappeto, il divano rosso. Dall'altra una stanza "
            "dai muri di terra, dove si gioca con quello che c'è.\n\n"
            f"Puoi regalare l'uno o l'altro.\n{REGALO_FB}\n👉 {link('fb', 15)} (retro: {link('fb', '15r')})\n\n{TAG_FB}"),
  instagram=f"Finestra 15 🔄 Due stanze, fronte e retro. Scorri ➡️\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 15 · Fronte o retro?", link_storia=link("ig-storia", 15),
  email_oggetto="Finestra 15: due stanze, due mondi 🔄")

g(data="2026-12-16", giorno=16, tipo="disegno", titolo="Colori di bacche e frutta", media="post", disegno=16, teaser=17,
  facebook=("Finestra 16 🎨\nBambini sul prato, un foglio, i colori: il disegno di oggi è un disegno che disegna.\n\n"
            f"Domani il verso:\n{q(17)}\n\n{REGALO_FB}\n👉 {link('fb', 16)}\n\n{TAG_FB}"),
  instagram=f"Finestra 16 🎨 Un disegno che disegna.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 16 · Regala questo disegno", link_storia=link("ig-storia", 16),
  email_oggetto="Finestra 16: colori di bacche e frutta 🎨")

g(data="2026-12-17", giorno=17, tipo="verso", titolo="Disegnano", media="reel_A",
  disegno=16, foto=FOTO + "2025-11-05 at 23.26.43.jpeg", didascalia_foto="Silvia e i bambini dipingono la scuola",
  facebook=(f"Finestra 17:\n{q(17)}\n\n"
            "E a volte i colori finiscono sui muri: qui Silvia e i bambini dipingono insieme la scuola.\n\n"
            f"🎁 Regala il disegno di ieri: 20 € per la Casa Famiglia Effatà.\n👉 {link('fb', 16)}\n\n{TAG_FB}"),
  instagram=f"Finestra 17 🎧\n{q(17)}\n\nSilvia e i bambini dipingono la scuola 🎨\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 17 · Ascolta il verso", link_storia=link("ig-storia", 16),
  email_oggetto="Finestra 17: «Disegnano con colori donati dalle bacche…»")

g(data="2026-12-18", giorno=18, tipo="disegno", titolo="Un giaciglio", media="post", disegno=18, teaser="17b",
  facebook=("Finestra 18 🛏️\nMaterassi sul pavimento, un'amaca, i panni stesi: la stanza dove si dorme.\n\n"
            f"Il verso che la accompagna:\n{q('17b')}\n\n"
            f"Manca una settimana a Natale: c'è ancora tempo per regalarlo.\n{REGALO_FB}\n👉 {link('fb', 18)}\n\n{TAG_FB}"),
  instagram=f"Finestra 18 🛏️ Materassi sul pavimento e un'amaca.\nManca una settimana a Natale.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 18 · Una settimana a Natale", link_storia=link("ig-storia", 18),
  email_oggetto="Finestra 18: una settimana a Natale 🛏️")

g(data="2026-12-19", giorno=19, tipo="disegno", titolo="Arriva qualcuno", media="post", disegno=19, teaser=20,
  facebook=("Finestra 19 🚙\nUna strada di terra, una jeep, e qualcuno che arriva: il disegno di oggi prepara il verso di domani, "
            "che parla di una persona che conosciamo bene.\n\n"
            f"{REGALO_FB}\n👉 {link('fb', 19)}\n\n{TAG_FB}"),
  instagram=f"Finestra 19 🚙 Qualcuno sta arrivando… domani scoprite chi.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 19 · Domani scoprite chi", link_storia=link("ig-storia", 19),
  email_oggetto="Finestra 19: qualcuno sta arrivando 🚙")

g(data="2026-12-20", giorno=20, tipo="verso", titolo="Silvia", media="reel_A",
  disegno=19, foto=FOTO + "2025-11-05 at 23.19.30.jpeg", didascalia_foto="Silvia, Uganda",
  facebook=(f"Finestra 20 💛\n{q(20)}\n\n"
            "La filastrocca arriva a lei: Silvia, la nostra fondatrice, che ha scelto di vivere in Uganda accanto ai "
            "bambini della Casa Famiglia Effatà.\n\n"
            f"🎁 Mancano 5 giorni a Natale: regala un disegno e aiutala anche tu. 20 €.\n👉 {link('fb', 19)}\n\n{TAG_FB}"),
  instagram=f"Finestra 20 💛\n{q(20)}\n\nQuesta è Silvia.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 20 · Questa è Silvia", link_storia=link("ig-storia", 19),
  email_oggetto="Finestra 20: una di queste Silvia si chiama 💛")

g(data="2026-12-21", giorno=21, tipo="disegno", titolo="La scuola e il cortile", media="carosello", disegno=21,
  disegni=["porta-21", "retro-21"],
  facebook=("Finestra 21: ancora fronte e retro 🔄\n"
            "Davanti una scuola di mattoni con i bambini sulla porta, dietro il cortile con il maiale e le galline.\n\n"
            f"Domani il verso che li spiega:\n{q(22)}\n\n"
            f"{REGALO_FB}\n👉 {link('fb', 21)} (retro: {link('fb', '21r')})\n\n{TAG_FB}"),
  instagram=f"Finestra 21 🔄 La scuola e il cortile. Scorri ➡️\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 21 · Fronte o retro?", link_storia=link("ig-storia", 21),
  email_oggetto="Finestra 21: la scuola e il cortile 🏫")

g(data="2026-12-22", giorno=22, tipo="verso", titolo="Scuole, case, materassi", media="reel_B", disegno=None,
  facebook=(f"Finestra 22:\n{q(22)}\n\n"
            "È quello che Silvia fa ogni giorno con la Casa Famiglia Effatà. E con un regalo di Natale puoi esserci "
            "anche tu: la gift card arriva per email o su WhatsApp, anche se la compri all'ultimo momento.\n\n"
            f"🎁 20 € · scegli il tuo disegno 👉 {link('fb')}\n\n{TAG_FB}"),
  instagram=f"Finestra 22 🎧\n{q(22)}\n\nIl regalo dell'ultimo minuto che arriva lontano.\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 22 · Il regalo dell'ultimo minuto", link_storia=link("ig-storia"),
  email_oggetto="Finestra 22: il regalo dell'ultimo minuto 🎁")

g(data="2026-12-23", giorno=23, tipo="disegno", titolo="Un cuore solo", media="post", disegno=23, teaser=24,
  facebook=("Finestra 23 ❤️\nItalia e Uganda nello stesso cuore, come due pezzi di un puzzle.\n\n"
            f"Domani l'ultimo verso:\n{q(24)}\n\n"
            "Ultima chiamata: la gift card si apre stanotte a mezzanotte, quella tra il 23 e il 24. Se la regali oggi, "
            "chi la riceve la trova pronta per la Vigilia.\n\n"
            f"{REGALO_FB}\n👉 {link('fb', 23)}\n\n{TAG_FB}"),
  instagram=f"Finestra 23 ❤️ Italia e Uganda, un cuore solo.\nUltima chiamata per la Vigilia 🎁\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 23 · Ultima chiamata", link_storia=link("ig-storia", 23),
  email_oggetto="Finestra 23: ultima chiamata per la Vigilia ❤️",
  note="DA VERIFICARE: fino a quando si può comprare e cosa riceve chi compra il 24 (la card è già aperta).")

g(data="2026-12-24", giorno=24, tipo="verso", titolo="Anche noi · Vigilia", media="reel_B", disegno=None,
  facebook=(f"Finestra 24, l'ultimo verso:\n{q(24)}\n\n"
            "È la Vigilia. Grazie a chi ha già regalato un disegno: in questo momento sta arrivando a qualcuno, "
            "per email o su WhatsApp.\nE se ti manca ancora un regalo, sei in tempo anche oggi.\n\n"
            f"🎁 20 € per la Casa Famiglia Effatà in Uganda 👉 {link('fb')}\n\n{TAG_FB}"),
  instagram=f"Finestra 24 🎧 L'ultimo verso.\n{q(24)}\n\nBuona Vigilia 🌟\n\n{REGALO_IG}\n\n{TAG_IG}",
  storia="Finestra 24 · Buona Vigilia", link_storia=link("ig-storia"),
  email_oggetto="Finestra 24: l'ultimo verso 🌟",
  note="DA VERIFICARE: acquisti del 24 ancora attivi?")

g(data="2026-12-25", giorno=25, tipo="chiusura", titolo="Buon Natale", media="carosello", disegno=None,
  disegni=["retro-25", "porta-25"],
  facebook=("🌟 Buon Natale da Effatà!\n\n"
            "L'ultima finestra si apre sul presepe. Grazie a tutti quelli che in questi 25 giorni hanno letto, "
            "ascoltato, condiviso e regalato i disegni della nostra filastrocca: ogni gift card è arrivata a qualcuno "
            "e ha raggiunto la Casa Famiglia Effatà in Uganda.\n\n"
            "Un grazie e un augurio di Buon Natale dai bambini di Effatà Children's Home 💛\n\n"
            f"{TAG_FB}"),
  instagram=f"🌟 Buon Natale da Effatà!\nGrazie a chi ha letto, ascoltato, condiviso e regalato 💛\nUn augurio dai bambini di Effatà Children's Home.\n\n{TAG_IG}",
  storia="Buon Natale · Grazie! 💛", link_storia=None,
  email_oggetto="Buon Natale da Effatà 🌟",
  note="Pubblicare dopo le 00:00 del 25 (invio delle email delle gift card). La seconda immagine è la copertina "
       "del libro 'I Bambini salveranno il Natale': verificare diritti e citazione.")

# ---------------------------------------------------------------- COME SI REGALA (in ogni scheda fino al 24)
COME_FB = ("🎁 Come si regala un disegno:\n"
           "1️⃣ apri il link e scegli il disegno che ti piace\n"
           "2️⃣ scrivi il nome di chi lo riceve e, se vuoi, un messaggio\n"
           "3️⃣ paga 20 € con carta o Satispay\n"
           "4️⃣ la gift card arriva per email o su WhatsApp e si apre il 24 dicembre a mezzanotte")
COME_IG = ("👉 Come si regala: link in bio → scegli il disegno → scrivi il nome di chi lo riceve → "
           "20 € con carta o Satispay → arriva per email o WhatsApp")
for d in giorni:
    if 0 <= d["giorno"] <= 24:
        for k, blocco in (("facebook", COME_FB), ("instagram", COME_IG)):
            testo, _, tag = d[k].rpartition("\n\n#")
            d[k] = f"{testo}\n\n{blocco}\n\n#{tag}"

# ---------------------------------------------------------------- ISCRIZIONE (prima settimana)
ISCR_FB = "📩 Vuoi ricevere ogni mattina la finestra del giorno via email? Iscriviti qui: https://effataitalia.it/iscriviti/"
ISCR_IG = "📩 Per ricevere ogni mattina la finestra via email: iscriviti dal link in bio"
for d in giorni:
    if 1 <= d["giorno"] <= 7:
        for k, riga in (("facebook", ISCR_FB), ("instagram", ISCR_IG)):
            testo, _, tag = d[k].rpartition("\n\n#")
            d[k] = f"{testo}\n\n{riga}\n\n#{tag}"

# ---------------------------------------------------------------- USCITE
if __name__ == "__main__":
    out = {"orario": "07:30", "giorni": giorni, "versi": {str(k): v for k, v in V.items()}}
    json.dump(out, open(os.path.join(HERE, "piano.json"), "w"), ensure_ascii=False, indent=2)
    with open(os.path.join(HERE, "testi.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Data", "Finestra", "Tipo", "Titolo", "Formato", "Facebook", "Instagram", "Storia (testo)",
                    "Link storia (sticker)", "Oggetto email", "Note"])
        for d in giorni:
            w.writerow([d["data"], d["giorno"] or "lancio", d["tipo"], d["titolo"], d["media"], d["facebook"],
                        d["instagram"], d["storia"], d.get("link_storia") or "", d.get("email_oggetto") or "",
                        d.get("note", "")])
    print(len(giorni), "giorni")
