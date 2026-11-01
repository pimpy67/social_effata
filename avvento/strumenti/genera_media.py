"""Genera immagini e video della campagna dell'Avvento a partire da piano.json.

Uso: python3 genera_media.py ASSETS FOTO_DIR OUT [data ...]
  ASSETS   cartella con dis/ (porta-NN.jpg, retro-NN.jpg), audio/ (porta-NN.mp3),
           logo-effata.png e sfondo-silvia.jpg (lo sfondo del sito, public/images/Silvia.jpg)
  FOTO_DIR cartella che contiene "IMMAGINI/INIZI DI SILVIA/..." (disco Extreme SSD/EFFATA)
  OUT      cartella di uscita: una sottocartella per giorno (AAAA-MM-GG)

Stile ripreso dalla pagina natale-avvento del calendario: foto di Silvia con i bambini
sotto un velo blu-viola, neve (❄), Poppins per i titoli, intestazione oro, finestre con gli
angoli arrotondati e il numero in una pillola scura, versi in Patrick Hand dorato su crema.
"""
import json
import os
import random
import subprocess
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS, FOTO_DIR, OUT = sys.argv[1:4]
SOLO = set(sys.argv[4:])

FONT = os.path.join(HERE, "fonts")
POP = os.path.join(FONT, "Poppins-Regular.ttf")
POP_SB = os.path.join(FONT, "Poppins-SemiBold.ttf")
POP_B = os.path.join(FONT, "Poppins-Bold.ttf")
HAND = os.path.join(FONT, "PatrickHand.ttf")
FLAKE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Colori del sito (natale-avvento.css)
VELO_TOP, VELO_BOTTOM = (20, 20, 43, 186), (42, 21, 32, 217)  # rgba(20,20,43,.73) → rgba(42,21,32,.85)
GOLD, RED, WHITE = (245, 210, 122), (237, 28, 35), (255, 255, 255)
MUTED = (255, 255, 255, 178)
CREMA = (255, 253, 242)
URL = "calendario.effataitalia.it/natale"
FPS = 30
CAROSELLO = [1, 3, 5, 7, 9, 11, 13, 15, 16, 18, 19, 21, 23]
MESE = "dicembre"

piano = json.load(open(os.path.join(HERE, "piano.json")))
VERSI = piano["versi"]


def F(path, size):
    return ImageFont.truetype(path, size)


# --------------------------------------------------------------- MATTONI DELLO STILE
def sfondo(w, h):
    """Foto di Silvia con i bambini a tutto campo, sotto il velo blu-viola del sito"""
    foto = ImageOps.fit(Image.open(os.path.join(ASSETS, "sfondo-silvia.jpg")).convert("RGB"), (w, h),
                        Image.LANCZOS, centering=(0.5, 0.35))
    velo = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(velo)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(VELO_TOP[i] + (VELO_BOTTOM[i] - VELO_TOP[i]) * t) for i in range(4)))
    out = Image.alpha_composite(foto.convert("RGBA"), velo)
    # alone dorato in alto, come l'intestazione del sito
    alone = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(alone).ellipse([-w * 0.3, -h * 0.25, w * 1.3, h * 0.28], fill=(245, 210, 122, 40))
    return Image.alpha_composite(out, alone.filter(ImageFilter.GaussianBlur(w // 8)))


def neve(w, h, n, seed, scala=1.0):
    """Livello trasparente con i fiocchi ❄ del sito (bianco al 75%)"""
    rnd = random.Random(seed)
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for _ in range(n):
        size = int(rnd.uniform(25, 62) * scala)
        d.text((rnd.uniform(-20, w), rnd.uniform(-20, h)), "❄", font=F(FLAKE, size), fill=(255, 255, 255, 190))
    return lay


def center(d, w, y, text, font, fill, spacing=0):
    if spacing:
        tot = sum(d.textlength(c, font=font) for c in text) + spacing * (len(text) - 1)
        x = (w - tot) / 2
        for c in text:
            d.text((x, y), c, font=font, fill=fill); x += d.textlength(c, font=font) + spacing
    else:
        d.text(((w - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)


def bagliore(img, w, y, text, font):
    """Titolo bianco con l'alone dorato del sito (text-shadow 0 0 24px oro)"""
    g = Image.new("RGBA", img.size, (0, 0, 0, 0))
    center(ImageDraw.Draw(g), w, y, text, font, (245, 210, 122, 200))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(14)))
    center(ImageDraw.Draw(img), w, y, text, font, WHITE)


def logo(img, x, y, size=150):
    lg = Image.open(os.path.join(ASSETS, "logo-effata.png")).convert("RGBA")
    lg = ImageOps.contain(lg, (size - 24, size - 24), Image.LANCZOS)
    box = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(box).rounded_rectangle([0, 0, size - 1, size - 1], size // 5, fill=WHITE)
    box.alpha_composite(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
    img.alpha_composite(box, (x, y))


def intestazione(img, w, y, riga):
    """CASA FAMIGLIA EFFATÀ · UGANDA / Natale a Effatà / Finestra N · N dicembre"""
    d = ImageDraw.Draw(img)
    center(d, w, y, "CASA FAMIGLIA EFFATÀ · UGANDA", F(POP, 30), GOLD, spacing=3)
    bagliore(img, w, y + 44, "Natale a Effatà", F(POP_B, 74))
    if riga:
        center(ImageDraw.Draw(img), w, y + 146, riga, F(POP_SB, 40), GOLD)


def finestra(img, dis, box_w, box_h, x0, y0, numero=None, oggi=True):
    """Il disegno come una finestra del sito: angoli arrotondati, bordo oro, numero nella pillola scura"""
    dis = ImageOps.contain(dis.convert("RGB"), (box_w, box_h), Image.LANCZOS)
    r = 28
    mask = Image.new("L", dis.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, dis.width - 1, dis.height - 1], r, fill=255)
    x = x0 + (box_w - dis.width) // 2
    y = y0 + (box_h - dis.height) // 2
    if oggi:  # .door.today: anello oro + bagliore
        g = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([x - 14, y - 14, x + dis.width + 14, y + dis.height + 14], r + 14,
                                            fill=(245, 210, 122, 130))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(16)))
        ImageDraw.Draw(img).rounded_rectangle([x - 8, y - 8, x + dis.width + 8, y + dis.height + 8], r + 8, fill=GOLD)
    img.paste(dis, (x, y), mask)
    if numero is not None:
        d = ImageDraw.Draw(img)
        f = F(POP_B, 54)
        t = str(numero)
        tw = d.textlength(t, font=f)
        pw, ph = max(96, tw + 50), 84
        px, py = x + (dis.width - pw) / 2, y + dis.height - ph - 24
        pill = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(pill).rounded_rectangle([px, py, px + pw, py + ph], ph // 2, fill=(0, 0, 0, 150))
        img.alpha_composite(pill)
        ImageDraw.Draw(img).text((px + (pw - tw) / 2, py + 6), t, font=f, fill=WHITE)
    return y + dis.height


def testo_oro(img, x0, y0, w, lines, font, lh):
    """Testo in Patrick Hand con il gradiente dorato della filastrocca del sito"""
    h = lh * len(lines) + 20
    maschera = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(maschera)
    for i, ln in enumerate(lines):
        d.text(((w - d.textlength(ln, font=font)) / 2, i * lh), ln, font=font, fill=255)
    grad = Image.new("RGB", (w, h))
    gd = ImageDraw.Draw(grad)
    stops = [(0, (122, 90, 14)), (.35, (184, 134, 11)), (.5, (210, 160, 60)), (.65, (184, 134, 11)), (1, (122, 90, 14))]
    for x in range(w):
        t = x / w
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= t <= b:
                k = (t - a) / (b - a)
                gd.line([(x, 0), (x, h)], fill=tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3)))
                break
    ombra = Image.new("RGBA", (w, h), (120, 80, 10, 0))
    ombra.putalpha(maschera.filter(ImageFilter.GaussianBlur(2)).point(lambda v: v * 0.35))
    img.alpha_composite(ombra, (x0, y0))
    img.paste(grad, (x0, y0), maschera)


def cartoncino_verso(img, w, y, verso, larghezza=920, size=64, wrap_at=26):
    """Il verso su un cartoncino crema, come la porta di testo del sito"""
    lines = wrap(verso, wrap_at)
    font = F(HAND, size)
    lh = int(size * 1.3)
    ch = lh * len(lines) + 90
    x = (w - larghezza) // 2
    ombra = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ombra).rounded_rectangle([x, y + 10, x + larghezza, y + ch + 10], 30, fill=(0, 0, 0, 110))
    img.alpha_composite(ombra.filter(ImageFilter.GaussianBlur(14)))
    ImageDraw.Draw(img).rounded_rectangle([x, y, x + larghezza, y + ch], 30, fill=CREMA)
    testo_oro(img, x + 30, y + 45, larghezza - 60, lines, font, lh)
    return y + ch


def pulsante(img, w, y, testo, size=46, h=100):
    d = ImageDraw.Draw(img)
    f = F(POP_B, size)
    bw = d.textlength(testo, font=f) + 100
    ombra = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ombra).rounded_rectangle([(w - bw) / 2, y + 8, (w + bw) / 2, y + h + 8], h // 2, fill=(0, 0, 0, 90))
    img.alpha_composite(ombra.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(w - bw) / 2, y, (w + bw) / 2, y + h], h // 2, fill=RED)
    center(d, w, y + (h - size) / 2 - size * 0.18, testo, f, WHITE)


def wrap(text, width):
    lines = []
    for part in text.split("\n"):
        lines += textwrap.wrap(part, width) or [""]
    return lines


def dis(nome):
    return Image.open(os.path.join(ASSETS, "dis", f"{nome}.jpg")).convert("RGB")


def foto(path):
    return ImageOps.exif_transpose(Image.open(os.path.join(FOTO_DIR, path))).convert("RGB")


def salva(img, out):
    img.convert("RGB").save(out, quality=92)


# --------------------------------------------------------------- IMMAGINI
def post_disegno(giorno, nome, out, etichetta=None, con_neve=True):
    """Post 4:5: intestazione del sito, la finestra del giorno, il pulsante rosso"""
    W, H = 1080, 1350
    c = sfondo(W, H)
    if con_neve:
        c.alpha_composite(neve(W, H, 26, seed=giorno * 7 + len(nome)))
    logo(c, W - 130 - 32, 32, 130)
    intestazione(c, W, 165, f"Finestra {giorno} · {giorno} {MESE}" + (f" · {etichetta}" if etichetta else ""))
    fine = finestra(c, dis(nome), 940, 620, (W - 940) // 2, 395, numero=giorno)
    pulsante(c, W, fine + 56, "Regala questo disegno · 20 €")
    center(ImageDraw.Draw(c), W, fine + 186, URL, F(POP_SB, 34), GOLD)
    salva(c, out)


def post_natale(nome, out):
    W, H = 1080, 1350
    c = sfondo(W, H)
    c.alpha_composite(neve(W, H, 30, seed=2512))
    logo(c, W - 130 - 32, 32, 130)
    intestazione(c, W, 165, "Buon Natale!")
    fine = finestra(c, dis(nome), 900, 700, 90, 395, numero=25 if nome == "retro-25" else None)
    d = ImageDraw.Draw(c)
    center(d, W, fine + 40, "Un grazie e un augurio di Buon Natale", F(HAND, 50), WHITE)
    center(d, W, fine + 100, "dai bambini di Effatà Children's Home", F(HAND, 50), WHITE)
    salva(c, out)


def storia(out, giorno, img=None, didascalia=None, verso=None, invito="Regala questo disegno",
           sotto="20 € · per la Casa Famiglia Effatà in Uganda", link=True, riga=None, seed=0, con_neve=True):
    """Storia 9:16: zona libera in basso per lo sticker Link di Instagram"""
    W, H = 1080, 1920
    c = sfondo(W, H)
    if con_neve:
        c.alpha_composite(neve(W, H, 34, seed=seed or (giorno or 0) * 13 + 5))
    logo(c, (W - 130) // 2, 150, 130)
    intestazione(c, W, 300, riga if riga is not None else (f"Finestra {giorno} · {giorno} {MESE}" if giorno else None))
    y = 520
    if img is not None:
        if verso:
            vs, wa = 46, 32
            card_h = int(vs * 1.3) * len(wrap(verso, wa)) + 90
            box_h = min(620, 1270 - y - (50 if didascalia else 0) - 24 - card_h - 28)
        else:
            box_h = 640
        y = finestra(c, img, 960, box_h, 60, y, numero=None if didascalia else giorno) + 14
        if didascalia:
            center(ImageDraw.Draw(c), W, y + 6, didascalia, F(POP, 28), (230, 225, 240)); y += 50
    if verso:
        y = cartoncino_verso(c, W, y + 24, verso, size=46 if img is not None else 66, wrap_at=32 if img is not None else 24)
    y = min(max(y + 50, 1150), 1330)
    d = ImageDraw.Draw(c)
    center(d, W, y, invito, F(POP_B, 58), WHITE)
    if link:
        # la riga oro a metà tra l'invito e "Tocca il link"
        center(d, W, (y + 70 + 1500) / 2 - 22, sotto, F(POP, 32), GOLD)
        riquadro_link(c, "Tocca il link qui sotto")
    else:
        center(d, W, y + 84, sotto, F(POP, 32), GOLD)
    salva(c, out)


def riquadro_link(c, testo):
    """Il riquadro dove va lo sticker Link di Instagram: con l'indirizzo scritto, così non resta mai vuoto"""
    W = c.width
    d = ImageDraw.Draw(c)
    center(d, W, 1500, testo, F(POP_SB, 32), (230, 225, 240))
    box = Image.new("RGBA", c.size, (0, 0, 0, 0))
    ImageDraw.Draw(box).rounded_rectangle([170, 1560, 910, 1680], 60, fill=(255, 255, 255, 235))
    c.alpha_composite(box)
    d = ImageDraw.Draw(c)
    center(d, W, 1598, "🔗".replace("🔗", "") + URL, F(POP_SB, 36), (30, 30, 60))


# --------------------------------------------------------------- VIDEO
def run(cmd):
    subprocess.run(cmd, check=True)


def durata(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", path]).strip())


def strisce_neve(tmp, W=1080, H=1920):
    """Due livelli di neve alti 2H (lo stesso disegno ripetuto) per farli cadere in loop"""
    for nome, n, scala, seed in (("neve1.png", 26, 0.7, 11), ("neve2.png", 14, 1.15, 23)):
        tile = neve(W, H, n, seed=seed, scala=scala)
        strip = Image.new("RGBA", (W, 2 * H), (0, 0, 0, 0))
        strip.alpha_composite(tile, (0, 0)); strip.alpha_composite(tile, (0, H))
        strip.save(os.path.join(tmp, nome))


NEVE_FILTRO = ("[{a}][n1]overlay=x='12*sin(t/2)':y='mod(t*70\\,1920)-1920'[s1];"
               "[s1][n2]overlay=x='-18*sin(t/3)':y='mod(t*130\\,1920)-1920'[{b}]")


def cartolina_regalo(nome, out, titolo="Regala questo disegno", griglia=False):
    W, H = 1080, 1920
    e = sfondo(W, H)
    logo(e, (W - 130) // 2, 150, 130)
    intestazione(e, W, 300, None)
    d = ImageDraw.Draw(e)
    center(d, W, 470, titolo, F(POP_B, 66), WHITE)
    if griglia:
        tw, th = 300, 212
        x0 = (W - 3 * tw - 2 * 18) // 2
        for k, n in enumerate(CAROSELLO[:9]):
            t = ImageOps.fit(dis(f"porta-{n:02d}"), (tw, th), Image.LANCZOS)
            m = Image.new("L", t.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, tw - 1, th - 1], 18, fill=255)
            e.paste(t, (x0 + (k % 3) * (tw + 18), 580 + (k // 3) * (th + 18)), m)
        yb = 580 + 3 * (th + 18) + 50
    else:
        yb = finestra(e, dis(nome), 860, 560, 110, 580) + 60
    pulsante(e, W, yb, "20 € · un regalo solidale", size=50, h=106)
    d = ImageDraw.Draw(e)
    center(d, W, yb + 150, "per la Casa Famiglia Effatà in Uganda", F(POP, 40), WHITE)
    center(d, W, yb + 214, URL, F(POP_SB, 40), GOLD)
    center(d, W, yb + 270, "link in bio", F(POP, 32), (230, 225, 240))
    salva(e, out)


def reel_A(g, cartella):
    """Foto vera + verso sul cartoncino + voce, poi cartolina con il disegno del giorno prima. Neve che cade."""
    W, H = 1080, 1920
    tmp = os.path.join(cartella, "_tmp"); os.makedirs(tmp, exist_ok=True)
    giorno = g["giorno"]; verso = VERSI[str(giorno)]
    audio = os.path.join(ASSETS, "audio", f"porta-{giorno:02d}.mp3")
    im = foto(g["foto"])
    dy = 540
    card_h = int(54 * 1.3) * len(wrap(verso, 30)) + 90
    box_h = min(640, 1560 - dy - (46 if g.get("didascalia_foto") else 0) - 20 - card_h - 40)
    r = min(960 / im.width, box_h / im.height)
    dw, dh = int(im.width * r) // 2 * 2, int(im.height * r) // 2 * 2
    bg = sfondo(W, H)
    logo(bg, (W - 130) // 2, 150, 130)
    intestazione(bg, W, 300, f"Finestra {giorno} · {giorno} {MESE}")
    # cornice oro della foto (la foto vera arriva sopra con lo zoom)
    x = (W - dw) // 2
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gl).rounded_rectangle([x - 14, dy - 14, x + dw + 14, dy + dh + 14], 42, fill=(245, 210, 122, 130))
    bg.alpha_composite(gl.filter(ImageFilter.GaussianBlur(16)))
    ImageDraw.Draw(bg).rounded_rectangle([x - 8, dy - 8, x + dw + 8, dy + dh + 8], 36, fill=GOLD)
    y = dy + dh + 18
    if g.get("didascalia_foto"):
        center(ImageDraw.Draw(bg), W, y + 4, g["didascalia_foto"], F(POP, 28), (230, 225, 240)); y += 46
    y = cartoncino_verso(bg, W, y + 20, verso, size=54, wrap_at=30)
    center(ImageDraw.Draw(bg), W, y + 30, URL, F(POP_SB, 34), GOLD)
    salva(bg, f"{tmp}/bg.png")
    im.resize((dw * 2, dh * 2), Image.LANCZOS).save(f"{tmp}/foto.png")
    m = Image.new("L", (dw, dh), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, dw - 1, dh - 1], 28, fill=255)
    m.save(f"{tmp}/mask.png")
    cartolina_regalo(f"porta-{g['disegno']:02d}", f"{tmp}/fine.png")
    strisce_neve(tmp)
    voce = durata(audio)
    pannello_come(W, H, giorno, sticker=False).convert("RGB").save(f"{tmp}/come.png")
    A = round(voce + 1.2, 2); E = 3.5; C = 5.0; T = A + E + C; frames = int(A * FPS)
    ms = int(A * 1000)
    filt = (
        f"[1:v]zoompan=z='1+0.07*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={frames}:s={dw}x{dh}:fps={FPS},format=rgba[fz];[fz][5:v]alphamerge[f];"
        f"[0:v][f]overlay={x}:{dy}[a];[a]fade=t=in:st=0:d=0.4,trim=duration={A},setpts=PTS-STARTPTS[va];"
        f"[2:v]trim=duration={E},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.4[ve];"
        f"[4:v]trim=duration={C},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.4[vc];"
        f"[va][ve][vc]concat=n=3:v=1:a=0[base];"
        + NEVE_FILTRO.format(a="base", b="nv") + ";[nv]format=yuv420p[v];"
        # voce della filastrocca, poi (finita la voce) la musica di Natale che entra piano
        f"[3:a]loudnorm=I=-16:TP=-1.5,apad=whole_dur={T},aresample=48000[vo];"
        f"[8:a]atrim=0:{T - A},asetpts=PTS-STARTPTS,volume=0.8,afade=t=in:d=1.2,afade=t=out:st={max(0, T - A - 1.8)}:d=1.8,"
        f"adelay={ms}|{ms},apad=whole_dur={T},aresample=48000[mb];"
        f"[vo][mb]amix=inputs=2:duration=first:normalize=0[au]"
    ).replace("[n1]", "[6:v]").replace("[n2]", "[7:v]")
    out = os.path.join(cartella, "reel.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", str(A), "-i", f"{tmp}/bg.png",
         "-i", f"{tmp}/foto.png", "-loop", "1", "-framerate", str(FPS), "-t", str(E), "-i", f"{tmp}/fine.png",
         "-i", audio, "-loop", "1", "-framerate", str(FPS), "-t", str(C), "-i", f"{tmp}/come.png",
         "-loop", "1", "-i", f"{tmp}/mask.png",
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve1.png",
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve2.png",
         "-i", MUSICA,
         "-filter_complex", filt, "-map", "[v]", "-map", "[au]", "-t", str(T),
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS), "-c:a", "aac", "-b:a", "128k",
         "-ac", "2", "-movflags", "+faststart", out])
    subprocess.run(["rm", "-rf", tmp])
    return out


def reel_B(g, cartella, lancio=False):
    """Verso + voce (o apertura del lancio), carrellata delle finestre, griglia finale. Neve che cade."""
    W, H = 1080, 1920
    tmp = os.path.join(cartella, "_tmp"); os.makedirs(tmp, exist_ok=True)
    giorno = g["giorno"]
    v = sfondo(W, H)
    logo(v, (W - 130) // 2, 150, 130)
    if lancio:
        intestazione(v, W, 300, "Calendario dell'Avvento")
        d = ImageDraw.Draw(v); y = 760
        for ln in ["25 finestre,", "una al giorno,", "fino a Natale"]:
            bagliore(v, W, y, ln, F(POP_B, 92)); y += 130
        center(ImageDraw.Draw(v), W, y + 40, "dal 1° dicembre", F(POP_SB, 48), GOLD)
        audio, inizio = None, 3.5
    else:
        intestazione(v, W, 300, f"Finestra {giorno} · {giorno} {MESE}")
        lines = wrap(VERSI[str(giorno)], 22)
        y = max(560, (H - (len(lines) * 99 + 90)) // 2 + 60)
        cartoncino_verso(v, W, y, VERSI[str(giorno)], size=76, wrap_at=22)
        audio = os.path.join(ASSETS, "audio", f"porta-{giorno:02d}.mp3")
        inizio = durata(audio) + 0.9
    salva(v, f"{tmp}/00.png")
    for i, n in enumerate(CAROSELLO):
        c = sfondo(W, H)
        logo(c, (W - 130) // 2, 150, 130)
        intestazione(c, W, 300, None)
        d = ImageDraw.Draw(c)
        center(d, W, 520, "Scegli il disegno", F(POP_B, 66), WHITE)
        center(d, W, 602, "da regalare a Natale", F(POP_B, 66), WHITE)
        finestra(c, dis(f"porta-{n:02d}"), 960, 700, 60, 740, numero=n)
        center(ImageDraw.Draw(c), W, 1490, f"{i + 1} / {len(CAROSELLO)}", F(POP, 32), (230, 225, 240))
        salva(c, f"{tmp}/{i + 1:02d}.png")
    cartolina_regalo(None, f"{tmp}/99.png", titolo="Un disegno, un regalo", griglia=True)
    strisce_neve(tmp)
    seq = [("00.png", inizio)] + [(f"{i + 1:02d}.png", 1.6) for i in range(len(CAROSELLO))] + [("99.png", 3.5)]
    with open(f"{tmp}/list.txt", "w") as fl:
        for name, t in seq:
            fl.write(f"file '{tmp}/{name}'\nduration {t}\n")
        fl.write(f"file '{tmp}/{seq[-1][0]}'\n")
    T = round(sum(t for _, t in seq), 2)
    out = os.path.join(cartella, "reel.mp4")
    if audio:
        a_in = ["-i", audio]; a_f = f"[1:a]loudnorm=I=-16:TP=-1.5,apad=whole_dur={T},aresample=48000[a]"
    else:
        a_in = ["-f", "lavfi", "-t", str(T), "-i", "anullsrc=r=48000:cl=stereo"]; a_f = "[1:a]anull[a]"
    filt = (f"[0:v]fps={FPS},format=rgba[base];"
            + NEVE_FILTRO.format(a="base", b="nv").replace("[n1]", "[2:v]").replace("[n2]", "[3:v]")
            + f";[nv]format=yuv420p[v];{a_f}")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{tmp}/list.txt", *a_in,
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve1.png",
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve2.png",
         "-filter_complex", filt, "-map", "[v]", "-map", "[a]", "-t", str(T),
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "128k",
         "-ac", "2", "-movflags", "+faststart", out])
    subprocess.run(["rm", "-rf", tmp])
    return out



MUSICA = os.path.join(ASSETS, "musica", "astro-del-ciel-carillon.mp3")


def musica_filtro(idx, T, inizio=0.0):
    """Musica di Natale (carillon) quando non c'è la filastrocca: entra e sfuma"""
    return (f"[{idx}:a]atrim={inizio}:{inizio + T},asetpts=PTS-STARTPTS,afade=t=in:d=0.6,"
            f"afade=t=out:st={max(0, T - 1.8)}:d=1.8,aresample=48000[mu]")


def pannello_come(w, h, giorno=None, sticker=True):
    """Seconda parte dei video: come si regala un disegno, passo per passo"""
    c = sfondo(w, h)
    alto = h > 1500
    logo(c, (w - 130) // 2, 150, 130) if alto else logo(c, w - 130 - 32, 32, 130)
    y0 = 300 if alto else 165
    intestazione(c, w, y0, f"Finestra {giorno} · {giorno} {MESE}" if giorno else "Calendario dell'Avvento")
    d = ImageDraw.Draw(c)
    y = y0 + 240
    bagliore(c, w, y, "Come si regala un disegno", F(POP_B, 58))
    y += 110
    passi = [("1", "Apri il link e scegli", "il disegno che ti piace"),
             ("2", "Scrivi il nome di chi lo riceve", "e, se vuoi, un messaggio"),
             ("3", "Paga 20 €", "con carta o Satispay"),
             ("4", "Arriva per email o WhatsApp", "e si apre il 24 dicembre a mezzanotte")]
    passo_h = 190 if alto else 128
    f1, f2, rr = (F(POP_SB, 44), F(POP, 36), 42) if alto else (F(POP_SB, 38), F(POP, 32), 34)
    if alto:
        y += 20
    for n, t1, t2 in passi:
        box = Image.new("RGBA", c.size, (0, 0, 0, 0))
        ImageDraw.Draw(box).rounded_rectangle([60, y, w - 60, y + passo_h - 24], 28, fill=(255, 253, 242, 236))
        c.alpha_composite(box)
        d = ImageDraw.Draw(c)
        cy = y + (passo_h - 24) / 2
        d.ellipse([92, cy - rr, 92 + 2 * rr, cy + rr], fill=RED)
        fn = F(POP_B, 46 if alto else 40)
        d.text((92 + rr - d.textlength(n, font=fn) / 2, cy - rr * 0.9), n, font=fn, fill=WHITE)
        x = 92 + 2 * rr + 30
        d.text((x, cy - f1.size - 2), t1, font=f1, fill=(30, 30, 60))
        d.text((x, cy + 6), t2, font=f2, fill=(90, 85, 110))
        y += passo_h
    if alto and sticker:
        riquadro_link(c, "Tocca il link qui sotto")
    elif alto:  # nei Reel non c'è lo sticker: indirizzo e "link in bio"
        d = ImageDraw.Draw(c)
        center(d, w, y + 50, URL, F(POP_SB, 42), GOLD)
        center(d, w, y + 112, "link in bio", F(POP, 34), (230, 225, 240))
    else:
        center(ImageDraw.Draw(c), w, y + 30, URL, F(POP_SB, 38), GOLD)
    return c


def video_da_immagine(img_path, out, T=12.0, inizio_musica=0.0, seconda=None):
    """Storia o post fermo trasformato in video: neve che cade + musica di Natale.
    Con `seconda` (un'immagine) a metà video si passa, in dissolvenza, alla seconda schermata."""
    tmp = out + "_tmp"; os.makedirs(tmp, exist_ok=True)
    w, h = Image.open(img_path).size
    if seconda is not None:
        a = img_path
        seconda.convert("RGB").save(f"{tmp}/b.jpg", quality=92)
        meta = T / 2
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", str(meta + 0.5), "-i", a,
             "-loop", "1", "-framerate", str(FPS), "-t", str(meta + 0.5), "-i", f"{tmp}/b.jpg",
             "-filter_complex", f"[0:v][1:v]xfade=transition=fade:duration=0.6:offset={meta - 0.3},format=yuv420p[v]",
             "-map", "[v]", "-t", str(T), "-c:v", "libx264", "-crf", "16", "-preset", "fast", f"{tmp}/base.mp4"])
        img_path = f"{tmp}/base.mp4"
    for nome, n, scala, seed in (("neve1.png", int(26 * h / 1920), 0.7, 11), ("neve2.png", int(14 * h / 1920), 1.15, 23)):
        tile = neve(w, h, n, seed=seed, scala=scala)
        strip = Image.new("RGBA", (w, 2 * h), (0, 0, 0, 0)); strip.alpha_composite(tile, (0, 0)); strip.alpha_composite(tile, (0, h))
        strip.save(os.path.join(tmp, nome))
    nf = (f"[0:v]format=rgba[base];[base][1:v]overlay=x='12*sin(t/2)':y='mod(t*70\\,{h})-{h}'[s1];"
          f"[s1][2:v]overlay=x='-18*sin(t/3)':y='mod(t*130\\,{h})-{h}',format=yuv420p[v];" + musica_filtro(3, T, inizio_musica))
    primo = ["-i", img_path] if img_path.endswith(".mp4") else ["-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", img_path]
    run(["ffmpeg", "-v", "error", "-y", *primo,
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve1.png",
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve2.png", "-i", MUSICA,
         "-filter_complex", nf, "-map", "[v]", "-map", "[mu]", "-t", str(T), "-r", str(FPS),
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "128k",
         "-movflags", "+faststart", out])
    subprocess.run(["rm", "-rf", tmp])
    return out


# --------------------------------------------------------------- LANCIO (scheda 1)
def gift_card_mockup(w=900):
    """Due cartoncini come la gift card vera: davanti il disegno, dietro il messaggio (nome d'esempio)"""
    cw, ch = int(w * 0.62), int(w * 0.62 / 1.41)
    lay = Image.new("RGBA", (w, int(ch * 2.15)), (0, 0, 0, 0))
    def card(img):
        c = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
        sh = Image.new("RGBA", c.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([20, 26, cw + 20, ch + 26], 22, fill=(0, 0, 0, 120))
        c.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
        m = Image.new("L", (cw, ch), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, cw - 1, ch - 1], 22, fill=255)
        c.paste(img, (20, 20), m)
        return c
    retro = Image.new("RGB", (cw, ch), CREMA)
    d = ImageDraw.Draw(retro)
    lg = ImageOps.contain(Image.open(os.path.join(ASSETS, "logo-effata.png")).convert("RGBA"), (110, 110))
    retro.paste(lg, (cw - lg.width - 24, 20), lg)
    y = 120
    for ln in ["Cara Maria,", "con questo regalo aiuti", "i bambini di Effatà a ricevere", "cibo, scuola e protezione."]:
        d.text((40, y), ln, font=F(HAND, 40), fill=(40, 40, 40)); y += 50
    d.text((40, ch - 64), "Buon Natale dai bambini di Effatà Children's Home", font=F(HAND, 26), fill=(90, 90, 90))
    davanti = ImageOps.fit(dis("porta-11"), (cw, ch), Image.LANCZOS)
    b = card(retro).rotate(6, resample=Image.BICUBIC, expand=True)
    f = card(davanti).rotate(-5, resample=Image.BICUBIC, expand=True)
    lay.alpha_composite(b, (w - b.width, 0))
    lay.alpha_composite(f, (0, int(ch * 1.02)))
    return lay


def scena(titolo_righe, y_titolo=560, corpo=None, sotto=None, intest="Calendario dell'Avvento"):
    W, H = 1080, 1920
    c = sfondo(W, H)
    logo(c, (W - 130) // 2, 150, 130)
    intestazione(c, W, 300, intest)
    y = y_titolo
    for ln in titolo_righe:
        size = 70
        while size > 40 and ImageDraw.Draw(c).textlength(ln, font=F(POP_B, size)) > W - 100:
            size -= 2
        bagliore(c, W, y, ln, F(POP_B, size)); y += 92
    if corpo is not None:
        corpo(c, y + 40)
    if sotto:
        yy = 1500
        for ln in sotto:
            center(ImageDraw.Draw(c), W, yy, ln, F(POP_SB, 40), GOLD); yy += 56
    return c


def reel_lancio(g, cartella):
    """Reel che spiega l'iniziativa, senza voce: calendario → filastrocca → disegni → gift card → regalo solidale"""
    W, H = 1080, 1920
    tmp = os.path.join(cartella, "_tmp"); os.makedirs(tmp, exist_ok=True)
    scene = []

    def add(img, dur):
        n = f"{tmp}/s{len(scene):02d}.png"; salva(img, n); scene.append((n, dur))

    # 1. date
    def c1(c, y):
        center(ImageDraw.Draw(c), W, y + 20, "il nostro Calendario dell'Avvento", F(POP, 46), WHITE)
    add(scena(["Dal 1° al 25", "dicembre"], 640, c1), 3.2)
    # 2. una finestra al giorno: la griglia vera del sito
    def c2(c, y):
        gr = Image.open(os.path.join(ASSETS, "griglia-top.png")).convert("RGBA")
        gr = ImageOps.contain(gr, (760, 980), Image.LANCZOS)
        c.alpha_composite(gr, ((W - gr.width) // 2, y))
    add(scena(["Ogni giorno", "si apre una finestra"], 520, c2), 3.8)
    # 3. la filastrocca con i disegni
    def c3(c, y):
        yy = finestra(c, dis("porta-01"), 760, 480, 160, y, numero=1)
        cartoncino_verso(c, W, yy + 40, VERSI["2"], larghezza=860, size=52, wrap_at=30)
    add(scena(["Ci accompagna", "una filastrocca per l'Uganda"], 520, c3), 4.2)
    # 4. tutti i disegni sul sito (carrellata veloce)
    for n in [3, 5, 7, 9, 13, 16, 19, 23]:
        def c4(c, y, n=n):
            finestra(c, dis(f"porta-{n:02d}"), 960, 700, 60, y + 20, numero=n)
        add(scena(["Tutti i disegni", "sono sul sito del calendario"], 520, c4), 1.6)
    # 5. diventano gift card
    def c5(c, y):
        m = gift_card_mockup(900)
        c.alpha_composite(m, ((W - m.width) // 2, y + 20))
    add(scena(["Ogni disegno diventa", "una gift card di Natale"], 520, c5), 4.2)
    # 6. regalo solidale
    def c6(c, y):
        pulsante(c, W, y + 80, "Un regalo solidale · 20 €", size=52, h=112)
        d = ImageDraw.Draw(c)
        for i, ln in enumerate(["da regalare a chi vuoi tu,", "per email o su WhatsApp.", "", "Sostiene la Casa Famiglia", "Effatà in Uganda"]):
            center(d, W, y + 260 + i * 66, ln, F(POP_SB if i > 2 else POP, 46), WHITE)
    add(scena(["Questo Natale", "fai un regalo che vale due volte"], 520, c6,
              sotto=[URL, "link in bio"]), 5.0)

    strisce_neve(tmp)
    X = 0.4  # dissolvenza tra le scene
    ins, filt, prev, t = [], "", "0:v", scene[0][1]
    for i, (n, dur) in enumerate(scene):
        ins += ["-loop", "1", "-framerate", str(FPS), "-t", str(dur + X), "-i", n]
    for i in range(1, len(scene)):
        off = round(t - X, 3)
        filt += f"[{prev}][{i}:v]xfade=transition=fade:duration={X}:offset={off}[x{i}];"
        prev = f"x{i}"; t = t + scene[i][1]
    T = round(t, 2)
    k = len(scene)
    ins += ["-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve1.png",
            "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve2.png",
            "-i", MUSICA]
    filt += f"[{prev}]format=rgba[base];" + NEVE_FILTRO.format(a="base", b="nv").replace("[n1]", f"[{k}:v]").replace("[n2]", f"[{k+1}:v]")
    filt += ";[nv]format=yuv420p[v];" + musica_filtro(k + 2, T)
    out = os.path.join(cartella, "reel.mp4")
    run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", filt, "-map", "[v]", "-map", "[mu]",
         "-t", str(T), "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "96k",
         "-movflags", "+faststart", out])
    subprocess.run(["rm", "-rf", tmp])
    return out


def storia_lancio(out, con_neve=True):
    W, H = 1080, 1920
    c = sfondo(W, H)
    if con_neve:
        c.alpha_composite(neve(W, H, 34, seed=2911))
    logo(c, (W - 130) // 2, 150, 130)
    intestazione(c, W, 300, "Calendario dell'Avvento")
    bagliore(c, W, 520, "Dal 1° al 25 dicembre", F(POP_B, 62))
    center(ImageDraw.Draw(c), W, 610, "una finestra al giorno, con una filastrocca", F(POP, 38), WHITE)
    center(ImageDraw.Draw(c), W, 660, "e i suoi disegni", F(POP, 38), WHITE)
    gr = ImageOps.contain(Image.open(os.path.join(ASSETS, "griglia-top.png")).convert("RGBA"), (620, 560), Image.LANCZOS)
    c.alpha_composite(gr, ((W - gr.width) // 2, 740))
    d = ImageDraw.Draw(c)
    center(d, W, 1330, "Ogni disegno è una gift card", F(POP_B, 50), WHITE)
    center(d, W, 1415, "un regalo solidale da 20 € per la Casa Famiglia", F(POP, 32), GOLD)
    riquadro_link(c, "Scopri il calendario: tocca il link")
    salva(c, out)


def storia_con_voce(img_path, out, giorno):
    """Storia dei giorni con il verso: l'immagine con la voce che legge il verso, poi i 4 passi con la musica"""
    voce = os.path.join(ASSETS, "audio", f"porta-{giorno:02d}.mp3")
    A = round(durata(voce) + 1.0, 2); C = 5.0; T = A + C
    tmp = out + "_tmp"; os.makedirs(tmp, exist_ok=True)
    pannello_come(1080, 1920, giorno).convert("RGB").save(f"{tmp}/come.jpg", quality=92)
    strisce_neve(tmp)
    ms = int(A * 1000)
    filt = (f"[0:v][1:v]xfade=transition=fade:duration=0.6:offset={A - 0.3},format=rgba[base];"
            + NEVE_FILTRO.format(a="base", b="nv").replace("[n1]", "[2:v]").replace("[n2]", "[3:v]")
            + ";[nv]format=yuv420p[v];"
            f"[4:a]loudnorm=I=-16:TP=-1.5,apad=whole_dur={T},aresample=48000[vo];"
            f"[5:a]atrim=0:{C},asetpts=PTS-STARTPTS,volume=0.8,afade=t=in:d=1,afade=t=out:st={C - 1.5}:d=1.5,"
            f"adelay={ms}|{ms},apad=whole_dur={T},aresample=48000[mb];[vo][mb]amix=inputs=2:duration=first:normalize=0[au]")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", str(A + 0.4), "-i", img_path,
         "-loop", "1", "-framerate", str(FPS), "-t", str(C + 0.4), "-i", f"{tmp}/come.jpg",
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve1.png",
         "-loop", "1", "-framerate", str(FPS), "-t", str(T), "-i", f"{tmp}/neve2.png",
         "-i", voce, "-i", MUSICA, "-filter_complex", filt, "-map", "[v]", "-map", "[au]", "-t", str(T),
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS), "-c:a", "aac", "-b:a", "128k",
         "-ac", "2", "-movflags", "+faststart", out])
    subprocess.run(["rm", "-rf", tmp])
    return out


# --------------------------------------------------------------- GIORNI
def genera(g):
    cartella = os.path.join(OUT, g["data"]); os.makedirs(cartella, exist_ok=True)
    giorno, media = g["giorno"], g["media"]
    fatti = []
    if media == "post":
        # giorno con il disegno: niente filastrocca → post e storia diventano video con musica e neve
        m0 = (giorno * 11) % 70
        p = os.path.join(cartella, "post.jpg"); post_disegno(giorno, f"porta-{giorno:02d}", p); fatti.append(p)
        b = os.path.join(cartella, "_p.jpg"); post_disegno(giorno, f"porta-{giorno:02d}", b, con_neve=False)
        fatti.append(video_da_immagine(b, os.path.join(cartella, "post.mp4"), T=14, inizio_musica=m0,
                                       seconda=pannello_come(1080, 1350, giorno))); os.remove(b)
        s = os.path.join(cartella, "storia.jpg"); storia(s, giorno, img=dis(f"porta-{giorno:02d}")); fatti.append(s)
        b = os.path.join(cartella, "_s.jpg"); storia(b, giorno, img=dis(f"porta-{giorno:02d}"), con_neve=False)
        fatti.append(video_da_immagine(b, os.path.join(cartella, "storia.mp4"), T=14, inizio_musica=m0 + 14,
                                       seconda=pannello_come(1080, 1920, giorno))); os.remove(b)
    elif media == "carosello" and g["tipo"] == "disegno":
        for k, nome in enumerate(g["disegni"]):
            p = os.path.join(cartella, f"post-{k + 1}.jpg")
            post_disegno(giorno, nome, p, etichetta="fronte" if k == 0 else "retro"); fatti.append(p)
        s = os.path.join(cartella, "storia.jpg"); storia(s, giorno, img=dis(g["disegni"][0])); fatti.append(s)
    elif media == "carosello":  # Natale
        for k, nome in enumerate(g["disegni"]):
            p = os.path.join(cartella, f"post-{k + 1}.jpg"); post_natale(nome, p); fatti.append(p)
        s = os.path.join(cartella, "storia.jpg")
        storia(s, 25, img=dis("retro-25"), invito="Buon Natale!", sotto="Grazie a chi ha regalato un disegno",
               link=False); fatti.append(s)
    elif media == "reel_A":
        fatti.append(reel_A(g, cartella))
        s = os.path.join(cartella, "storia.jpg")
        kw = dict(img=foto(g["foto"]), didascalia=g.get("didascalia_foto"), verso=VERSI[str(giorno)],
                  invito="Regala il disegno di ieri")
        storia(s, giorno, **kw); fatti.append(s)
        b = os.path.join(cartella, "_s.jpg"); storia(b, giorno, con_neve=False, **kw)
        fatti.append(storia_con_voce(b, os.path.join(cartella, "storia.mp4"), giorno)); os.remove(b)
    elif media == "reel_lancio":
        fatti.append(reel_lancio(g, cartella))
        s = os.path.join(cartella, "storia.jpg"); storia_lancio(s); fatti.append(s)
        base = os.path.join(cartella, "_storia_base.jpg"); storia_lancio(base, con_neve=False)
        fatti.append(video_da_immagine(base, os.path.join(cartella, "storia.mp4"), T=12, inizio_musica=20)); os.remove(base)
    elif media in ("reel_B", "reel_B_lancio"):
        lancio = media == "reel_B_lancio"
        fatti.append(reel_B(g, cartella, lancio=lancio))
        s = os.path.join(cartella, "storia.jpg")
        if lancio:
            storia(s, None, img=dis("porta-01"), invito="Scegli il tuo disegno",
                   sotto="dal 1° dicembre, una finestra al giorno", riga="Calendario dell'Avvento", seed=2911)
        else:
            storia(s, giorno, verso=VERSI[str(giorno)], invito="Scegli il disegno da regalare")
        fatti.append(s)
    for k in ("facebook", "instagram"):
        open(os.path.join(cartella, f"{k}.txt"), "w").write(g[k] + "\n")
    return fatti


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for g in piano["giorni"]:
        if SOLO and g["data"] not in SOLO:
            continue
        fatti = genera(g)
        print(g["data"], g["media"], ", ".join(os.path.basename(f) for f in fatti), flush=True)
