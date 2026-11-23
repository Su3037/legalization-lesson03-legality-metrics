"""Apply media/voice/overrides.tsv to each sherpa-onnx engine's own lexicon (its native override
mechanism). Syllable spellings for each engine are learned from single characters that appear in
all three stock lexicons, so no phone set is typed by hand.
  python3 -I patch_lexicon.py /opt/models build/lexicons
"""
import sys
from pathlib import Path

M, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
FILES = {"matcha": M / "matcha-icefall-zh-baker/lexicon.txt", "melo": M / "vits-melo-tts-zh_en/lexicon.txt",
         "kokoro": M / "kokoro-multi-lang-v1_1/lexicon-zh.txt"}


def load(p):
    d = {}
    for line in p.read_text(encoding="utf-8").splitlines():
        t = line.split()
        if t and t[0] not in d:
            d[t[0]] = t[1:]
    return d


lex = {k: load(v) for k, v in FILES.items()}
syl = {"melo": {}, "kokoro": {}}
for ch, py in lex["matcha"].items():
    if len(ch) == 1 and len(py) == 1:
        for e in ("melo", "kokoro"):
            if ch in lex[e]:
                syl[e].setdefault(py[0], lex[e][ch])


def spell(engine, sylls):
    if engine == "matcha":
        return sylls
    parts = [syl[engine][s] for s in sylls]
    if engine == "kokoro":
        return [t for p in parts for t in p]
    # melo: phones of all syllables, then the tone of each phone
    phones, tones = [], []
    for p in parts:
        n = len(p) // 2
        phones += p[:n]
        tones += p[n:]
    return phones + tones


rows = [l.split("\t") for l in Path(__file__).with_name("overrides.tsv").read_text(encoding="utf-8").splitlines()
        if l and not l.startswith("#")]
for engine, path in FILES.items():
    lines = []
    for r in rows:
        word, sylls = r[0], r[1].split()
        lines.append(f"{word} {' '.join(spell(engine, sylls))}")
    patched = {l.split()[0] for l in lines}
    rest = [l for l in path.read_text(encoding="utf-8").splitlines() if l.split() and l.split()[0] not in patched]
    (OUT / f"{engine}-lexicon.txt").write_text("\n".join(lines + rest) + "\n", encoding="utf-8")
    print(engine, "\n  ".join(lines[:4]))
