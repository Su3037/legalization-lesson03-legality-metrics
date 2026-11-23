# Reproducibility

Tested in an Ubuntu container on 2026-11-23 with Node 22.23, Python 3.13, Playwright (Chromium) and
FFmpeg. Seeds: fast-check and the differential fuzz use 20261123.

```bash
npm ci                                   # fast-check, axe-core
pip install pytest hypothesis ortools    # Python tests and CP-SAT
npm test                                 # 19 JS tests
python3 -m pytest -q tests/py            # 14 Python tests (incl. Hypothesis properties)
node tests/diff/fuzz.mjs                 # 3,000 JS↔Python cases, expect 0 mismatches
python3 tests/mutants/run_mutants.py     # 18 mutants (OpenROAD part needs `openroad` on PATH)
python3 oracles/cpsat/optimum.py         # CP-SAT optimum -> oracles/cpsat/results.json
python3 oracles/openroad/real_design.py  # gcd demo (needs OpenROAD; see below)
python3 scripts/make_py_fixtures.py      # Python exercise fixtures
python3 python/exercise/check.py --impl reference   # expect PASS
node scripts/build-site.mjs              # -> dist/
python3 scripts/serve.py &               # http://127.0.0.1:8803/legalization-lesson03-legality-metrics/
node scripts/build-films.mjs --jobs     # list the voice paragraphs that need takes (build/voice-jobs.json)
python3 scripts/voice_takes.py          # Kokoro, one take per paragraph -> media/voice/takes/ (needs /opt/models)
node scripts/build-films.mjs            # clocks, captions, chapters, transcripts -> media/films/
node scripts/build-site.mjs && python3 scripts/serve.py 8803 &
node scripts/record-walk.mjs            # lab walkthrough screenshots from the real page -> media/walk/
for f in story concise advanced lab; do
  python3 scripts/mix_audio.py $f build/audio/$f.wav > media/renders/$f.zh.audio.json   # story needs the licensed track
  FILM=$f node scripts/film-stills.mjs build/stills/$f                                   # stills + determinism check
  node scripts/render-film.mjs $f media/renders/$f.zh.mp4 --audio=build/audio/$f.wav
done
node slides/build-slides.mjs             # 12 slides, PNGs, PDF
node tests/e2e/site.mjs build/e2e.json   # every page + axe-core (light and dark) + lab/film flows
SITE_URL=https://su3037.github.io/legalization-lesson03-legality-metrics/ node tests/e2e/site.mjs build/e2e-deployed.json
```

The film is a pure function of time: `stateAt(W, clock, t)` depends only on `t` and the data files,
so any frame can be re-rendered alone; `scripts/film-stills.mjs` checks that jumping around and a fresh
page give identical DOM. Identical consecutive frames reuse one screenshot, so a full render takes
about 5 minutes.

## OpenROAD

`micromamba create -p /opt/openroad -c litex-hub -c conda-forge openroad` gave
OpenROAD 2.0-12381-g01bba3695. The gcd flow is `oracles/openroad/gcd/gcd_gp_dp.tcl` (reads OpenROAD's
`test/gcd_nangate45.v` and Nangate45 LEF from a sparse clone at the same commit; no SDC, because
`set_all_input_output_delays` is not available in that build). Its log is `oracles/openroad/gcd/run.log`.

## Voice screening

`media/voice/{patch_lexicon,synth,screen}.py` with sherpa-onnx 2.0.3 and the models listed in
`docs/voice-casting.md` (downloaded from the sherpa-onnx GitHub releases into `/opt/models`, not
committed). Results: `media/voice/screen-results.json`.
