# Notices and licences

* **Code** (`src/`, `python/`, `scripts/`, `tests/`, `oracles/`, `slides/build-slides.mjs`, `media/voice/*.py`): MIT, see `LICENSE`.
* **Content** (lesson text, figures, film, captions, transcript, slides, `media/script.zh.md`, `media/lexicon.zh.tsv`, docs):
  Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/.
  Credit: "合法吗？布局合法性检查与指标 (Module 03 · Legality Metrics), Su3037, CC BY 4.0".

## Adapted material

* Yongfu Li, *eda-learning* — `courses/learn_legalization`, Module 01-03 (CC BY 4.0), commit
  `003bcd49e3794e6cfd2680181cdbd347d673ad07`, https://github.com/yongfu-li/eda-learning.
  **Changes:** `data/fixtures/tiny_legal.json` is copied unchanged. The checker, the greedy snap,
  overlap-removal and Abacus-lite helpers were re-implemented in JS and Python from the upstream
  behaviour, with these modifications: input validation before geometry (upstream accepts an empty
  placement as legal), exact non-unit site pitch via integer DBU, average/max displacement, a named
  immutable displacement reference, and Chinese teaching text, figures, film and exercises written new.

## Third-party inputs and tools (not relicensed)

* OpenROAD (BSD-3-Clause): `gcd_nangate45.v` and Nangate45 LEF from `test/` at `01bba3695` were used to
  produce `data/gcd-placement.json` and the DEFs under `oracles/openroad/gcd/`. Nangate45 Open Cell
  Library terms apply to the LEF-derived data.
* OR-Tools (Apache-2.0), fast-check (MIT), Hypothesis (MPL-2.0), axe-core (MPL-2.0), Playwright
  (Apache-2.0), FFmpeg (LGPL/GPL, used as a tool only).
* Voice models used **only for screening**; none is in the shipped film: Kokoro v1.1 (Apache-2.0),
  MeloTTS (MIT), Matcha-TTS with Databaker data (data non-commercial), via sherpa-onnx (Apache-2.0);
  ASR: Paraformer, SenseVoice, Whisper. The screening clips in `media/voice/clips/` are synthetic
  speech and are labelled as such.
* Fonts: rendered with system Noto Sans CJK (SIL Open Font License 1.1); no font files are shipped.
* No music is used.
