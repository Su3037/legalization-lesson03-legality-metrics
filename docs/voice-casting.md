> **Update (D17):** the author asked for narrated films. The 精讲 and 实验演示 films now ship with **Kokoro f20**
> (patched lexicon), synthesized one whole paragraph per chapter by `scripts/voice_takes.py`; caption boundaries
> snap to the pauses measured inside each take. The objective screen below still **fails** (CER 4.3–5.0% vs 3%);
> the voice is disclosed as synthetic everywhere it is used, and the listening test remains the upgrade path.

# Voice casting

**Outcome: no voice passed the pre-registered gates, so v1 ships the silent captioned cut.** The gates
were fixed before screening and were not changed afterwards.

## Pipeline and gates

1. Spoken script first (`media/script.zh.md`, written for the ear: one idea per sentence, breath `｜`
   and pause `‖` marks), pronunciation lexicon (`media/lexicon.zh.tsv`, 40 terms; 行 = háng, HPWL is read
   半周长线长).
2. Synthesis **by paragraph** (never caption by caption), 0.55 s between paragraphs (`media/voice/synth.py`).
3. Objective screen (`media/voice/screen.py`) on the 277-character audition text
   (`media/voice/audition.zh.txt`, the hardest sentences of the script):
   * ASR round-trip CER ≤ 3% on **two independent ASR models**. We ran three (Paraformer-zh 2024-03-09,
     SenseVoice 2024-07-17, Whisper-turbo with 25 s windows split at silences); the best candidate
     failed on all three, so the choice of two does not change the outcome;
   * 100% of lexicon terms read correctly (a single wrong 行 fails); toned-pinyin error rate is reported
     as a proxy before the by-ear check;
   * speaking rate 3.8–4.8 voiced characters/s; no pause > 1.2 s except where marked; F0 not flat
     (semitone range per paragraph);
   * licence permits public CC BY educational distribution;
   * mastering to −16 LUFS integrated, ≤ −1 dBTP.
4. Blind listener test (`/listen/`): ≥ 8 native Mandarin listeners, randomised unlabelled clips plus a
   hidden human reference; ship only if mean naturalness MOS ≥ 4.0 **and** < 30% judge it a machine.
5. Consent: no voice cloning without written consent; never imitate a public figure; any synthetic
   voice is disclosed on the page and in the credits.

## Candidates not auditioned, and why

The prompt's pool (Fun-CosyVoice3-0.5B, Qwen3-TTS 1.7B, VoxCPM2, Ming-3.0-tts, IndexTTS-2, Fish Audio S2,
and hosted ElevenLabs / StepAudio / Qwen-Audio / Doubao Seed-TTS / MiniMax) could not be run here:
huggingface.co and modelscope.cn are blocked by this container's network policy, and no hosted-TTS API
key was available. Leaderboards could not be re-read on the day for the same reason. Only models
published as GitHub release assets (the sherpa-onnx model zoo) were reachable. These remain the first
candidates to try on a machine with access, with the same gates.

## Candidates screened (open models runnable offline here)

| Clip | Engine (sherpa-onnx 2.0.3) | Lexicon | CER Paraformer / SenseVoice / Whisper | Toned-pinyin error | Voiced chars/s | F0 range (st) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| kokoro-f20 | Kokoro multi-lang v1.1, speaker 20 (Apache-2.0) | patched | 4.7% / 4.3% / 5.0% | 1.1–1.8% | 4.25 | 14.6–15.3 | **Fail** (CER) |
| kokoro-f20-stocklex | same, stock lexicon | stock | 5.4% / 5.0% / 6.1% | 1.1–1.5% | 4.25 | 14.6–15.3 | Fail (lexicon A/B only) |
| kokoro-m70 | Kokoro, speaker 70 | patched | 5.0% / 5.8% / 5.8% | 1.8% | 3.69 | 13.6–15.3 | Fail (CER, rate) |
| melo | MeloTTS zh_en VITS (MIT) | patched | 13.3% / 14.8% / 24.1% | 11.4–19.6% | 5.85 | 6.4–8.7 | Fail |
| matcha-baker | Matcha + Vocos, Databaker data (non-commercial) | patched | 18.4% / 18.0% / 17.6% | 12.6–13.7% | 4.68 | 11.7–14.5 | Fail; licence excludes it anyway |
| zipvoice | ZipVoice-distill zh-en | patched | ≈ 96% | — | — | — | Excluded: model/front-end mismatch in sherpa-onnx 2.0.3, and its prompt voice is an unknown speaker (consent rule) |

Findings that matter for any later attempt:

* Every stock open lexicon reads 一行 as *yì xíng* ("one trip") instead of *yì háng* ("one row").
  `media/voice/overrides.tsv` + `patch_lexicon.py` fix it (ASR heard 行李 from the stock voice and 行里
  from the patched one). Any future engine must get the same overrides.
* Kokoro's remaining errors are mostly ASR homophones (只是→指示, 待→带, "A"→一). The per-ASR CER gate is
  conservative for letters spoken inside Chinese; it was **not** relaxed.

Clips (level-matched to about −16 LUFS / −1.3 dBTP) are in `media/voice/clips/`. The blind test serves
`kokoro-f20`, `kokoro-m70`, `melo` and, once recorded, the human reference, under opaque names
(`media/voice/listen-pool.txt`; key in `media/voice/listen-key.json`).

## What would change the outcome (needs the user)

* **Human reference recording** (also the most likely ship candidate): a native speaker reads
  `media/voice/audition.zh.txt` in a quiet room, about 30 cm from the microphone, at a natural teaching
  pace, saved as `media/voice/human/ref.m4a`, with written consent to publish under CC BY 4.0. Then
  the full script by paragraph.
* A paid TTS key (e.g. a hosted neural voice that is **not** the edge-tts / Azure `*Neural` default),
  re-screened with the same gates.
* Running the listening test with ≥ 8 native listeners (`/listen/`), then
  `python3 scripts/score_listening.py results/*.json` (see `docs/learner-study.md` for logistics).

Screened on 2026-11-23 in this container; models are in `/opt/models` (not committed).
