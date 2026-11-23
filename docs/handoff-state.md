# Handoff state (2026-11-23)

**Built and published:** everything in the README table; CI and Pages workflows in `.github/workflows/`.

**Waiting on people (cannot be done by the build):**

1. Human reference recording of `media/voice/audition.zh.txt` → `media/voice/human/ref.m4a` (written
   consent to publish, CC BY 4.0). Rebuild the site; the listening page picks it up from
   `media/voice/listen-pool.txt`.
2. Blind listening test with ≥ 8 native listeners at `/listen/`; score with
   `python3 scripts/score_listening.py results/*.json`.
3. Learner study (3–5 learners, one think-aloud) per `docs/learner-study.md`; revise inventory items
   that ≥ 2 people miss.
4. Native-speaker confirmation of `media/lexicon.zh.tsv` (all 40 rows are marked pending).
5. Decide whether and when to post `docs/submission-draft.md` to issue #35 (not posted).

**If a voice passes later:** synthesise by paragraph with the lexicon overrides
(`media/voice/overrides.tsv`), force-align, re-time the clock from alignment (`src/film/cues.mjs`),
mix to −16 LUFS / −1 dBTP, re-render with `scripts/render-film.mjs`, and add the audio track.

**Environment notes:** OpenROAD from micromamba (`litex-hub`), OpenROAD source sparse clone at
`01bba3695`, sherpa-onnx models in `/opt/models` (not committed). Hugging Face, modelscope, hosted TTS
and ispd.cc / iccad-contest.org were not reachable from the build container.
