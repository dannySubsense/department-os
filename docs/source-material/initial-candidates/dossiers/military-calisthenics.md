# Candidate Dossier: Military Calisthenics App

## Status

`SEED — not yet evaluated by Department OS`

## Origin

Incubated in a ChatGPT project prior to Department OS. Progressed further than the other three candidates — into an actual React prototype (`assets/military-calisthenics.jsx`). Handed off to Department OS 2026-08-07.

## Trigger

Danny, describing a personal fitness restart after inconsistent exercise: "I'm seeing these military calisthenic app advertisements, and I'm not gonna pay for an app for exercising. So I thought maybe it would be fun if we created some sort of military calisthenics app for myself."

## Purchase resistance

Source-supported, in Danny's own words: explicit refusal to pay for an existing military-calisthenics app ("I'm not gonna pay for an app for exercising"), stated plainly rather than argued from product-page analysis (unlike the other two purchase-resistance candidates in this corpus).

## Desired useful part

A self-built calisthenics training app ("Field PT") fitted to Danny's actual situation — resuming training after a layoff, an inconsistent schedule — rather than generic recruit-level programming: baseline testing, session-based (not calendar-based) progression, a 12-session gradual ramp with re-test, and session/history tracking.

## Existing exploration

The most concretely developed candidate in the corpus:
- A working design for baseline testing, session generation, progression ramp (4→5 sets, 40%→60% of baseline, plank 50%→75% over 12 sessions), and a training log with a reps-per-session trend.
- A detailed UI/visual design pass (dark "tactical field-manual" theme, specific typefaces, screen-by-screen layout for Baseline/Home/Workout/Summary/Log).
- An actual React prototype file, `assets/military-calisthenics.jsx`, preserved alongside the chat.
- A persistence note: the prototype used an artifact-storage layer tied to the Claude app context, with an explicit note that standalone use would require swapping to `localStorage` or a small backend.

## Emerging differentiation

The chat shows a clear differentiation arc beyond the original ad-triggered idea: starting from plain text exercise cues, Danny explicitly rejected that ("no animations of bodies doing the workouts?" → "Naw, we need to go full board") and pushed toward AI-assisted 3D anatomical visualization with per-exercise muscle highlighting. The resulting discussion proposes a decoupled-rig architecture (one skeleton driving both a realistic skin layer and a per-muscle-mesh anatomical layer, sharing one animation clip) and a specific muscle-activation map per exercise (e.g. push-up: pec major/anterior delt/triceps primary, rectus abdominis/serratus secondary). This is a substantive, original differentiator beyond simply recreating the advertised app.

## Open questions

- The 3D anatomy/muscle-highlight pipeline (Z-Anatomy or Ecorche Rigged base model, Cascadeur motion capture, React Three Fiber delivery) is discussed but not shown as built in this source — is it still wanted, and at what priority relative to the base app?
- Several tool/pricing references appear in the chat (Ecorche Rigged "~$49," Cascadeur "free for indie use," Veo 3.1 "~$0.15/sec," Kling 3.0 "~$0.10/sec") — these are historical, unverified claims from the chat, not current sourced facts.
- Is this candidate purely personal/noncommercial, or does Danny want it evaluated for any broader audience? The source does not address this.

## Provenance

Sources: `docs/source-material/initial-candidates/military-calisthenics-chat.md` and `assets/military-calisthenics.jsx`. Per `MANIFEST.md`, no separate source ledger exists for this candidate ("Embedded source conversation only"); no external product URLs are cited in this chat.

## Current interpretation

- **Source-supported fact:** this candidate has the clearest, plainest-stated purchase-resistance trigger in the corpus, and is the only one with an existing code artifact.
- **Observation:** the idea visibly evolved beyond the triggering product (a generic calisthenics app) into an original technical direction (anatomically addressable muscle visualization) that the advertised apps were not shown to offer.
- **Interpretation:** this is the corpus's clearest example of Personal Pull progressing into "emerging differentiation" as described in the handoff brief — useful as a worked example during Intake/Interview when defining what "Personal Pull" requires structurally, but not evidence of market demand for the app.
- **Unresolved question:** whether the existing `.jsx` prototype should inform Prototype Department's eventual input format, or whether it is purely historical reference at this stage — no implementation decision is being made in this handoff.
