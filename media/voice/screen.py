"""Objective screens for audition clips (necessary, not sufficient).
  python3 -I screen.py <wav> [<wav> ...] > screen-results.json
For each clip: ASR round-trip CER with three independent ASR models (Paraformer, SenseVoice,
Whisper large-v3-turbo; all via sherpa-onnx), speaking rate on voiced time, long pauses,
per-paragraph F0 range in semitones, integrated loudness and an approximate true peak.
Polyphone readings (行 háng / xíng) cannot be judged by character ASR and are left to the
native-speaker listen (listening-test/ and docs/voice-casting.md)."""
import json
import re
import sys

import numpy as np
import parselmouth
import pyloudnorm as pyln
import scipy.signal as ss

sys.path.insert(0, __import__("os").path.dirname(__file__))
import engines as E  # noqa: E402

DIG = "零一二三四五六七八九"


def num_zh(m):
    s = m.group(0)
    if "." in s:
        a, b = s.split(".")
        return num_zh_int(int(a)) + "点" + "".join(DIG[int(c)] for c in b)
    return num_zh_int(int(s))


def num_zh_int(n):
    if n < 10:
        return DIG[n]
    if n < 20:
        return "十" + (DIG[n % 10] if n % 10 else "")
    if n < 100:
        return DIG[n // 10] + "十" + (DIG[n % 10] if n % 10 else "")
    return "".join(DIG[int(c)] for c in str(n))


def norm(s):
    s = s.upper().replace("OPEN ROAD", "OPENROAD").replace("OPEN-ROAD", "OPENROAD")
    s = re.sub(r"\d+(\.\d+)?", num_zh, s)
    s = s.replace("两", "二")  # ASR writes 两/二 interchangeably for 2
    return re.sub(r"[^一-鿿A-Z]", "", s)


def cer(ref, hyp):
    r, h = list(norm(ref)), list(norm(hyp))
    d = np.arange(len(h) + 1)
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def windows(x, sr, max_s):
    """Split at the quietest 10 ms frame near each max_s boundary (Whisper accepts < 30 s)."""
    out, start = [], 0
    hop = int(0.01 * sr)
    while len(x) - start > max_s * sr:
        lo, hi = start + int((max_s - 6) * sr), start + int(max_s * sr)
        e = np.array([np.abs(x[i:i + hop]).mean() for i in range(lo, hi, hop)])
        cut = lo + int(np.argmin(e)) * hop
        out.append(x[start:cut])
        start = cut
    out.append(x[start:])
    return out


def pinyin_er(ref, hyp):
    from pypinyin import lazy_pinyin, Style
    r = lazy_pinyin(norm(ref), style=Style.TONE3, neutral_tone_with_five=True)
    h = lazy_pinyin(norm(hyp), style=Style.TONE3, neutral_tone_with_five=True)
    d = np.arange(len(h) + 1)
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def voiced_seconds(x, sr, thr_db=-38, min_sil=0.25):
    hop = int(0.01 * sr)
    frames = np.lib.stride_tricks.sliding_window_view(x, hop)[::hop]
    db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    ref = np.percentile(db, 95)
    speech = db > (ref - 30)
    # silences
    sil, run = [], 0
    for v in speech:
        if not v:
            run += 1
        else:
            if run:
                sil.append(run * 0.01)
            run = 0
    long_sil = [s for s in sil if s >= min_sil]
    return speech.sum() * 0.01, sil


def main():
    asrs = {n: E.asr(n) for n in ("paraformer", "sensevoice", "whisper")}
    out = []
    for path in sys.argv[1:]:
        meta = json.load(open(path + ".json"))
        x, sr = E.read(path)
        res = {"clip": path.split("/")[-1], "engine": meta["engine"], "sid": meta["sid"], "patched_lexicon": meta["patched_lexicon"],
               "seconds": meta["seconds"], "paragraphs": []}
        allref, hyps = "", {n: "" for n in asrs}
        f0r = []
        for p in meta["paragraphs"]:
            seg = x[int(p["start"] * sr): int((p["start"] + p["dur"]) * sr)]
            allref += p["text"]
            for n, a in asrs.items():
                hyps[n] += "".join(E.transcribe(a, w, sr) for w in windows(seg, sr, 25 if n == "whisper" else 1e9))
            snd = parselmouth.Sound(seg.astype(np.float64), sampling_frequency=sr)
            f0 = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=500).selected_array["frequency"]
            f0 = f0[f0 > 0]
            st = 12 * np.log2(np.percentile(f0, 95) / np.percentile(f0, 5)) if len(f0) > 10 else 0
            f0r.append(round(float(st), 1))
        res["cer"] = {n: round(cer(allref, h), 4) for n, h in hyps.items()}
        res["toned_pinyin_error_rate"] = {n: round(pinyin_er(allref, h), 4) for n, h in hyps.items()}
        res["asr_text"] = hyps
        voiced, sil = voiced_seconds(x, sr)
        chars = len(norm(allref))
        res["chars_per_second_voiced"] = round(chars / voiced, 2)
        res["chars_per_second_overall"] = round(chars / meta["seconds"], 2)
        res["pauses_over_1_2s"] = sum(1 for s in sil if s > 1.2)
        res["f0_range_semitones_per_paragraph"] = f0r
        meter = pyln.Meter(sr)
        res["lufs_integrated"] = round(float(meter.integrated_loudness(x.astype(np.float64))), 1)
        up = ss.resample_poly(x, 4, 1)
        res["true_peak_dbtp_approx"] = round(float(20 * np.log10(np.abs(up).max() + 1e-12)), 2)
        res["rtf"] = meta["rtf"]
        out.append(res)
        print(res["clip"], res["cer"], res["chars_per_second_voiced"], res["pauses_over_1_2s"], f0r, file=sys.stderr)
    print(json.dumps(out, ensure_ascii=False, indent=1))


main()
