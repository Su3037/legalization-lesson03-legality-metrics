"""Synthesize the films' voice takes, one WHOLE paragraph per take (never caption by caption).
  python3 scripts/voice_takes.py [build/voice-jobs.json]
Engine: Kokoro multi-lang v1.1 (Apache-2.0), speaker 20, speed 1.0, with the course pronunciation lexicon patched
into Kokoro's own lexicon (media/voice/patch_lexicon.py; overrides in media/voice/overrides.tsv).
Each take is written as media/voice/takes/<key>.m4a plus <key>.json: measured duration and the silences inside it,
which scripts/build-films.mjs uses to place caption boundaries. Models: $MODELS (default /opt/models).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "media/voice"))
import engines as E  # noqa: E402

SID, SPEED = 20, 1.0


def silences(x, sr, win=0.02, floor_db=-38.0, min_len=0.12):
    n = int(win * sr)
    frames = len(x) // n
    rms = np.sqrt(np.mean(x[: frames * n].reshape(frames, n) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms / (np.max(rms) + 1e-12))
    quiet = db < floor_db
    out, start = [], None
    for i, q in enumerate(list(quiet) + [False]):
        if q and start is None:
            start = i
        if not q and start is not None:
            if (i - start) * win >= min_len and start > 0:
                out.append([round(start * win, 3), round(i * win, 3)])
            start = None
    return out


def main(jobs_path):
    jobs = json.loads(Path(jobs_path).read_text())
    out_dir = ROOT / "media/voice/takes"
    out_dir.mkdir(parents=True, exist_ok=True)
    if not jobs:
        print("no voice takes to synthesize")
        return
    tts = E.tts("kokoro", patched=True)
    for j in jobs:
        a = tts.generate(j["text"], sid=SID, speed=SPEED)
        x = np.array(a.samples, dtype=np.float32)
        # trim leading/trailing silence so the clock measures speech only
        nz = np.nonzero(np.abs(x) > 0.01 * np.max(np.abs(x)))[0]
        x = x[max(0, nz[0] - int(0.03 * a.sample_rate)): nz[-1] + int(0.08 * a.sample_rate)]
        wav = out_dir / f"{j['key']}.wav"
        sf.write(wav, x, a.sample_rate, subtype="PCM_16")
        m4a = out_dir / f"{j['key']}.m4a"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1", str(m4a)], check=True)
        wav.unlink()
        meta = {"key": j["key"], "text": j["text"], "engine": "kokoro-multi-lang-v1_1", "speaker": SID, "speed": SPEED,
                "lexicon": "patched (media/voice/overrides.tsv)", "duration": round(len(x) / a.sample_rate, 3),
                "gaps": silences(x, a.sample_rate)}
        (out_dir / f"{j['key']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
        print(j["key"], meta["duration"], "s", len(meta["gaps"]), "pauses", flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "build/voice-jobs.json")
