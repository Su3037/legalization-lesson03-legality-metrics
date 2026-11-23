# Learner study (protocol, one page)

**Status: not run.** Everything below is ready; it needs 3–5 real learners recruited by the course
owner. No results are reported until it has been run.

**Question.** Does the lesson (film or text) plus the live checker remove the eight misconceptions in
the concept inventory (`src/lab/challenges.js`, `INVENTORY`, items I1–I8)?

**Participants.** 3–5 students who have not taken a legalization course. Assign an ID (e.g. `P01`);
never record names. Tell them they can stop at any time and that the lesson is being tested, not them.

**Procedure (≈ 50 min, one person at a time, organizer present).** Participant page: `/study/`.

| Step | Time | What | Output file |
| --- | --- | --- | --- |
| 1 | 8 min | Pre-test: 8 inventory items + confidence (no lookup) — `/challenges/#inventory-pre` | `inventory-pre-P01.json` |
| 2 | 20 min | Lesson: film (`/film/`) **or** text (`/lesson/`), alternate between participants | — |
| 3 | 15 min | Challenges 1–8, hints allowed. **Think-aloud** for one participant: they say what they are trying while using the lab; the organizer writes down where they hesitate, with timestamps | `challenges-progress.json`, think-aloud notes |
| 4 | 8 min | Post-test: same 8 items — `/challenges/#inventory-post` | `inventory-post-P01.json` |
| 5 | 3 min | Survey (difficulty, confidence, hardest part, problems) on `/study/` | `survey-P01.json` |

**Analysis (decided in advance).** Per item: number correct pre → post, and confident-wrong answers
(confidence ≥ 4 and wrong), which mark a robust misconception. With n ≤ 5 there is no significance
test; report raw counts per participant and per item. An item is **revised** if ≥ 2 participants
answer it wrong on the post-test, or if any participant reports it as ambiguous. Record each revision
in `docs/decision-log.md`.

**Animatic screening (film).** The prompt asked for a scratch-voice animatic screened with 2–3
learners before locking the script. That was not possible without learners; the script was locked by
the author. Mark as not run.

**Data handling.** All forms are static pages; files are downloaded by the participant and handed to
the organizer. Nothing is uploaded. Store files outside the public repository.

**Listening test (separate).** `/listen/` with ≥ 8 native Mandarin listeners; score with
`python3 scripts/score_listening.py results/*.json`. See `docs/voice-casting.md`.
