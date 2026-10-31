"""Musica di sottofondo per i contenuti senza filastrocca: "Astro del ciel" (Franz Gruber, 1818,
di pubblico dominio) suonata da un carillon sintetizzato qui, quindi senza diritti d'autore.

Uso: python3 musica_carillon.py out.wav [ripetizioni]
"""
import sys
import wave

import numpy as np

SR = 44100
OTTAVO = 0.36  # 6/8, ♩. ≈ 56

NOTE = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}


def freq(n, ott):
    return 440.0 * 2 ** ((NOTE[n] + 12 * (ott - 4)) / 12)


# melodia (nota, ottava, ottavi): ottava 5 = registro del carillon
M = [("G", 5, 3), ("A", 5, 1), ("G", 5, 2), ("E", 5, 6),
     ("G", 5, 3), ("A", 5, 1), ("G", 5, 2), ("E", 5, 6),
     ("D", 6, 4), ("D", 6, 2), ("B", 5, 6),
     ("C", 6, 4), ("C", 6, 2), ("G", 5, 6),
     ("A", 5, 4), ("A", 5, 2), ("C", 6, 3), ("B", 5, 1), ("A", 5, 2),
     ("G", 5, 3), ("A", 5, 1), ("G", 5, 2), ("E", 5, 6),
     ("A", 5, 4), ("A", 5, 2), ("C", 6, 3), ("B", 5, 1), ("A", 5, 2),
     ("G", 5, 3), ("A", 5, 1), ("G", 5, 2), ("E", 5, 6),
     ("D", 6, 4), ("D", 6, 2), ("F", 6, 3), ("D", 6, 1), ("B", 5, 2),
     ("C", 6, 6), ("E", 6, 6),
     ("C", 6, 3), ("G", 5, 1), ("E", 5, 2), ("G", 5, 3), ("F", 5, 1), ("D", 5, 2),
     ("C", 5, 12)]
# basso: una nota per battuta (6 ottavi)
BASSO = ["C", "C", "G", "C", "F", "C", "F", "C", "G", "C", "C", "G", "C", "C"]
BASSO_OTT = {"C": 3, "F": 3, "G": 2}


def tine(f, dur, amp):
    """Lamella di carillon: fondamentale + parziali inarmoniche con decadimento rapido"""
    n = int(SR * max(dur, 1.6))
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2)
         + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 4.0)
         + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 9.0))
    att = np.minimum(1, t / 0.004)
    return amp * s * att


def brano():
    tot = sum(d for _, _, d in M) * OTTAVO + 2.5
    out = np.zeros(int(SR * tot))
    t = 0.0
    for n, o, d in M:
        s = tine(freq(n, o), d * OTTAVO, 0.5)
        i = int(t * SR); out[i:i + len(s)] += s[:len(out) - i]
        t += d * OTTAVO
    for b, n in enumerate(BASSO):
        s = tine(freq(n, BASSO_OTT[n]), 6 * OTTAVO, 0.28)
        i = int(b * 6 * OTTAVO * SR)
        if i < len(out):
            out[i:i + len(s)] += s[:len(out) - i]
    return out


def riverbero(x):
    rng = np.random.default_rng(7)
    n = int(SR * 1.8)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2)
    ir[0] = 0
    wet = np.convolve(x, ir)[: len(x)]
    wet /= np.max(np.abs(wet)) + 1e-9
    return x / (np.max(np.abs(x)) + 1e-9) * 0.8 + wet * 0.25


def main():
    out = sys.argv[1]
    rip = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    x = np.concatenate([brano() for _ in range(rip)])
    y = riverbero(x)
    y = y / np.max(np.abs(y)) * 0.9
    st = np.stack([y, np.roll(y, int(SR * 0.012))], axis=1)  # un po' di stereo
    with wave.open(out, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())
    print(out, round(len(y) / SR, 1), "s")


if __name__ == "__main__":
    main()
