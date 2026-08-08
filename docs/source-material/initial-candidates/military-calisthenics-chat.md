---
title: Military Calisthenics App
source: ChatGPT project handoff
status: historical-source
seed_status: SEED — not yet evaluated by Department OS
handoff_date: 2026-08-07
---

# Military Calisthenics App — Chat Transcript

---

## User

I want to, um, improve my exercise routine. I actually haven't exercised, um, regularly in a couple years. It's embarrassing to say. Okay. I started exercising this last week. It's a little spotty. But, anyway, it's a start. And I'm seeing these military calisthenic app advertisements, and I'm not gonna pay for an app for exercising. So I thought maybe it would be fun if we created some sort of military calisthenics app for myself. What do you think?

## Assistant

Love this — you've got the skills to build exactly the app those ads are gatekeeping, and a self-built one can actually fit your real situation (coming back after a layoff, spotty schedule) instead of throwing recruit-level volume at you on day one.

Two design calls baked in, both swappable:

- **Sessions advance by completion, not by calendar.** Miss a few days and nothing breaks or shames you — you just pick up at the next session. Better fit for "spotty."
- **Baseline is submaximal.** You log what you can do stopping ~1–2 reps before form breaks, not a max-out. Safer on a deconditioned body, and better training practice anyway. Volume then ramps gradually over ~12 sessions before prompting a re-test.

**Field PT** — a self-contained calisthenics app. How it works:

1. **Baseline** — log submaximal push-ups, squats, sit-ups, plank hold, pull-ups (0 if no bar).
2. **Sessions** generate from your baseline: warm-up → full-body work with rep targets + timed holds → optional burpee finisher → cool-down, with countdown ring timers and auto-advancing rest.
3. **Progression** ramps gradually over 12 sessions (4→5 sets, 40%→60% of baseline per set, plank 50%→75%), then prompts a re-test to recalibrate.
4. Tracks total sessions, weekly count, a reps-per-session trend chart, and a full log.

Movements rotate the accessory slot (reverse lunges → mountain climbers → flutter kicks → burpees) so it stays varied without you tracking anything.

**Two things worth knowing:**

- **Persistence** uses the artifact storage layer, so progress survives across sessions inside the Claude app. To run it standalone on the R630 or a phone, the storage calls (`window.storage.get/set`) swap to `localStorage` or a small FastAPI/Postgres backend.
- The progression is intentionally conservative for week 1 of a comeback. If it feels too light after a few sessions, the ramp can be steepened or a run/ruck cardio day added for fuller military-PT coverage (ACFT-style).

---

## User

Describe the UI to me

## Assistant

Overall it's a **dark tactical field-manual look** — deep olive-charcoal background with a faint gradient glow up top, sand/khaki text, **amber** as the "action/work" color, **olive-green** for success and rest, a touch of rust for the optional finisher. Two typefaces carry it: condensed **Oswald** (drill-poster style) for headers and big numbers, **JetBrains Mono** for labels, timers, and data. Everything is a single mobile-width column (~480px). The two signature devices are a bordered **stamp badge** (mono caps, e.g. `READY` / `SESSION 003`) and a **segmented circular countdown ring** for timers.

Screen by screen:

**Baseline (onboarding)** — "Step 1 · Baseline" eyebrow, big `SET YOUR LINE` header, a short instruction about submaximal testing, then five number fields (push-ups, air squats, sit-ups, plank seconds, pull-ups) each with a label and a mono hint. Amber "Lock it in" button stays greyed out until the four required fields are filled.

**Home / Daily Orders** — `DAILY ORDERS` headline with a status stamp (olive `READY`, or amber `RE-TEST` when a block is done). Three stat cards (Sessions, This week, Phase x/12), then a large amber Start button. Below: an amber callout if a re-test is due, a reps-per-session line chart once you've logged ≥2 sessions, a "view log" button, and a small "edit baseline" link.

**Workout** — top bar with the session stamp and an abort ✕, plus a thin amber progress bar. Each step renders differently:

- *Warm-up / cool-down*: titled block with a checklist card and a CTA.
- *Rep set*: "Set 2 / 5" eyebrow, exercise name, a huge amber rep number with unit, a form cue, and a big "Set complete" button.
- *Timed set*: the ring counting down in amber labeled `WORK`, with Pause / Done-early buttons.
- *Rest*: olive ring labeled `RECOVER`; auto-advances and beeps at zero, with Pause / Skip.
- *Finisher*: rust stamp, then "Do it · Ns" or "Skip."

**Summary** — centered olive check circle, `MISSION COMPLETE`, two stat cards (total reps, movements), a per-exercise breakdown card, and a "Back to orders" button.

**Training Log** — newest-first list of session cards, each showing session number, date/time, a finisher flag, and total reps on the right.

Small touches: amber keyboard-focus outlines, reduced-motion respected, and a short square-wave beep when a timer hits zero.

---

## User

So no animations of bodies doing the workouts?

## Assistant

Correct — right now it's text only: exercise name, rep/time target, and a one-line form cue. No moving figures.

That's a deliberate gap, not an oversight, because demonstration assets are the one thing that's genuinely hard to do cleanly in a self-contained app:

- **Video/GIF clips** (what the paid apps use) look best but are licensed footage — not going to scrape those, and they can't bundle into a single file anyway.
- **Lottie animations** are lightweight but you'd still need to source the JSON per movement, same licensing question.
- **Embedded YouTube demos** per exercise are trivial to add but rely on external links, not in-app motion.
- **Hand-built SVG/CSS stick-figure loops** — a simple articulated figure doing the push-up / squat / plank rep on a loop. Fully self-contained, no assets, no licensing, scales infinitely. Looks more "field-manual diagram" than glossy, which actually fits the aesthetic.

The stick-figure route is the only one that's truly free, in-app, and on-brand. Could animate the core movements (push-up, squat, sit-up, plank, lunge, mountain climber, flutter kick, burpee, pull-up) as looping SVG figures, one per work screen.

---

## User

Naw, we need to go full board. So I am thinking AI gen. Either realistic or Unity human rig style, or human realistic and we highlight in red the target muscles for each exercise. We don't need to create it here. Claude Desktop is not the right place, but let's plan it out.

## Assistant

Good — the tooling reshuffled recently, and one finding settles the architecture before we even debate realistic-vs-rig.

### Bottom line

The **"highlight target muscles in red"** requirement is the deciding constraint, and it kills pure AI video as the primary tool. Muscle highlighting needs the active muscles to be *addressable* — separate, named meshes you can light up. AI video gives you flat pixels with no anatomical handles, plus it still botches exactly what a rep demo can't afford: hands, fast movement, and face/limb continuity are where these models still predictably fail, clips top out around 15–20s, and every regen is nondeterministic.

So: **3D rig pipeline, with AI doing the motion (not the pixels).** And since the app is already React, the strongest version is a **live React Three Fiber viewer**, not pre-rendered clips. There's a documented pattern for exactly this — an interactive R3F anatomy model that highlights the muscles activated during a selected exercise, requiring a model where individual muscles are separate named meshes, running 60fps in-browser.

### The architecture that makes "realistic OR muscle view" free

Decouple motion from skin. One rigged skeleton drives **two layers that share it**:

1. a realistic skinned body (default view), and
2. an anatomical muscle layer underneath, where each muscle is its own mesh.

Same animation clip plays both. A runtime toggle swaps between "realistic demo" and "muscle map," and the red-highlight is just an emissive material swap on the active meshes per exercise. Both modes from one asset, no double production.

### Recommended stack

- **Base model:** Z-Anatomy (open-source, .blend → glTF, per-muscle meshes) for the free route, or the **Ecorche Rigged** model (~$49, every bone/muscle a separate named object, IK/FK rig already built) to skip prep. Pair with a skinned MakeHuman/MetaHuman body sharing the rig.
- **Animation:** **Cascadeur 2026.1** — free for indie use; its **Video Mocap** turns a phone clip of each rep into a biomechanically correct, physics-corrected animation, exports FBX/USD/glTF. This is the right place for AI: motion that's anatomically *correct*, which generative video can't guarantee.
- **Delivery:** React Three Fiber component in the existing app. glTF with embedded clips, an `<exercise → {mesh: intensity}>` map drives the highlight. Drop-in replacement for the current text panel.
- **Hardware:** all runs locally on the 4090 (Cascadeur, Blender, glTF optimization). R630 can batch-export headless. No cloud spend required.

### Muscle-activation map (the real data artifact)

Primary (full red) / secondary (amber):

- **Push-up:** pec major, anterior delt, triceps / rectus abdominis, serratus
- **Air squat:** quads, glute max / hamstrings, adductors, gastroc, erectors
- **Pull-up:** lat dorsi, biceps / posterior delt, rhomboids, lower traps, forearm flexors
- **Sit-up:** rectus abdominis / obliques, iliopsoas
- **Plank:** transverse abdominis, rectus abdominis / delts, quads, glutes (isometric)
- **Reverse lunge:** glute max, quads / hamstrings, adductors, gastroc
- **Mountain climbers:** rectus abdominis, hip flexors / obliques, delts, quads
- **Flutter kicks:** lower rectus abdominis, hip flexors / obliques
- **Burpee:** full-body composite (quads, glutes, pecs, delts, triceps, core)

### Where realistic AI video still earns a slot

Not for per-exercise demos — for **hero/marketing content** (a polished intro reel). **Veo 3.1** is the photoreal-human pick (~$0.15/sec fast mode); **Kling 3.0** the cheap-iteration one (~$0.10/sec); **Wan 2.7 / HunyuanVideo 1.5** are Apache-licensed and run on the 4090 for a fully local option. Keep that scope separate from the demo system.

### The one real tradeoff

3D front-loads effort (rig once, animate ~9 movements, wire the map) but amortizes forever — deterministic, re-renderable, every angle free, muscle data built in. Video is cheap per clip but fights consistency and gives zero anatomical control. For something you'll maintain, 3D wins decisively.

Two decisions to make: (1) **free Z-Anatomy prep vs. the ~$49 pre-rigged Ecorche** — the paid one probably saves a weekend; (2) **live R3F vs. pre-rendered loops** — live is more impressive and data-driven but more build. Recommendation: Ecorche + live R3F.

---
