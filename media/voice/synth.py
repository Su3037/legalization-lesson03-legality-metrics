"""Synthesize a text file paragraph by paragraph (never caption by caption) with one engine.
  python3 -I synth.py <engine> <sid> <speed> <text.txt> <out.wav> [--stock-lexicon]
Paragraphs are joined with 0.55 s of silence. Writes <out>.json with per-paragraph timing."""
import json
import sys
import time

import numpy as np
import soundfile as sf

sys.path.insert(0, __import__("os").path.dirname(__file__))
import engines as E  # noqa: E402

engine, sid, speed, src, out = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
patched = "--stock-lexicon" not in sys.argv
paras = [p.strip() for p in open(src, encoding="utf-8").read().split("\n") if p.strip()]
t = E.tts(engine, patched=patched)
chunks, meta, sr = [], [], None
t0 = time.time()
prompt = None
if engine == "zipvoice":
    px, psr = E.read(str(E.M / "sherpa-onnx-zipvoice-distill-zh-en-emilia/prompt.wav"))
    prompt = ("周日被我射熄火了，所以今天是周一。", px, psr)
pos = 0.0
for i, p in enumerate(paras):
    if prompt:
        a = t.generate(p, prompt[0], prompt[1].tolist(), prompt[2], speed=speed, num_steps=8)
    else:
        a = t.generate(p, sid=sid, speed=speed)
    sr = a.sample_rate
    x = np.array(a.samples, dtype=np.float32)
    chunks.append(x)
    meta.append({"i": i, "text": p, "start": round(pos, 3), "dur": round(len(x) / sr, 3)})
    pos += len(x) / sr
    sil = np.zeros(int(0.55 * sr), dtype=np.float32)
    chunks.append(sil)
    pos += 0.55
y = np.concatenate(chunks[:-1])
sf.write(out, y, sr, subtype="PCM_16")
json.dump({"engine": engine, "sid": sid, "speed": speed, "patched_lexicon": patched, "sr": sr,
           "seconds": round(len(y) / sr, 3), "rtf": round((time.time() - t0) / (len(y) / sr), 3), "paragraphs": meta},
          open(out + ".json", "w"), ensure_ascii=False, indent=1)
print(out, round(len(y) / sr, 1), "s")
