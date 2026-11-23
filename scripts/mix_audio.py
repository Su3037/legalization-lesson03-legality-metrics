"""Mix one film's soundtrack from its clock.   python3 scripts/mix_audio.py <film> <out.wav>

  story     the author's licensed track (We Never (Remix)（若如初见）, Hi Noise / 秋成). It is NOT in the repository:
            set LEGALITY_MUSIC_WENEVER, or place it at /mnt/project-files/private-music/wenever.m4a or
            build/private/wenever.m4a. 0.6 s fade-in, 3 s fade-out, gain 0.9. The film's cues were cut to it.
  concise,  the measured paragraph takes (media/voice/takes/*.m4a), each placed at its cue's voiceAt time from
  lab       media/films/<film>.clock.zh.json, over the original NumPy score (scripts/music.py) ducked by 9 dB.
  advanced  the original NumPy score only (no narration).

The last line printed is JSON describing the mix (sources, their SHA-256, loudness), saved next to the MP4.
"""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import music  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SR = music.SR


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2).astype(np.float64)


def fit(x, n):
    return x[:n] if len(x) >= n else np.concatenate([x, np.zeros((n - len(x), 2))])


def music_track():
    for p in [os.environ.get("LEGALITY_MUSIC_WENEVER"), "/mnt/project-files/private-music/wenever.m4a", str(ROOT / "build/private/wenever.m4a")]:
        if p and Path(p).is_file():
            return Path(p)
    raise SystemExit("story needs the licensed music track: set LEGALITY_MUSIC_WENEVER (see scripts/mix_audio.py)")


def loudness(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    tail = r[r.rfind("Summary:"):]
    get = lambda key: float(tail.split(key)[1].split()[0])  # noqa: E731
    return {"integratedLUFS": get("I:"), "truePeakDBTP": get("Peak:")}


def main(film, out):
    clock = json.loads((ROOT / f"media/films/{film}.clock.zh.json").read_text())
    dur = clock["duration"]
    n = int(round(dur * SR))
    info = {"film": film, "duration": dur}
    if clock["kind"] == "music":
        src = music_track()
        x = fit(decode(src), n) * 0.9
        fi, fo = int(0.6 * SR), int(3.0 * SR)
        x[:fi] *= np.linspace(0, 1, fi)[:, None]
        x[-fo:] *= np.linspace(1, 0, fo)[:, None]
        meta = json.loads((ROOT / "content/music/wenever.json").read_text())
        info.update(audio="music", track=f"{meta['track']} · {meta['artist']}", sourceSha256=sha(src), inRepository=False)
    else:
        cues = [c["start"] for c in clock["cues"]]
        mood = {"concise": "calm", "advanced": "curious", "lab": "steady"}.get(film, "calm")
        bed = music.score(dur, cues, mood=mood, seed=7)
        if clock["kind"] in ("voice", "walk"):
            bed *= 10 ** (-9 / 20)
            voice = np.zeros((n, 2))
            takes = []
            for c in clock["cues"]:
                if c["id"] == "end":
                    continue
                if "voice" not in c or c.get("provisional"):
                    raise SystemExit(f"{film}: cue {c['title']} has no measured voice take")
                v = decode(ROOT / c["voice"])
                a = int(round(c["voiceAt"] * SR))
                m = min(len(v), n - a)
                voice[a:a + m] += v[:m]
                takes.append({"file": c["voice"], "at": c["voiceAt"], "sha256": sha(ROOT / c["voice"])})
            peak = np.max(np.abs(voice)) or 1
            voice *= 0.8 / peak  # about -1.9 dBFS sample peak, so the true peak stays under -1 dBTP
            x = fit(bed, n) + voice
            info.update(audio="voice+score", voice="Kokoro multi-lang v1.1, speaker 20, patched lexicon", takes=len(takes),
                        takesSha256=hashlib.sha256(json.dumps(takes).encode()).hexdigest())
        else:
            x = fit(bed, n)
            info.update(audio="score")
    peak = np.max(np.abs(x))
    if peak > 0.98:
        x *= 0.98 / peak
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    music.write_wav(out, x)
    info["wavSha256"] = sha(out)
    info.update(loudness(out))
    print(json.dumps(info, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
