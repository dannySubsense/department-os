# Progress: problem-department-mvp

## Status: IN_PROGRESS

## Slices
- [x] Slice 1: Runtime & Storage Evaluation — COMPLETE (2026-08-10). DDR-0001 ACCEPTED. Runtime: Claude Agent SDK / direct Anthropic API. Storage: dedicated local Postgres for Department OS Core (separate from LORE).
- [ ] Slice 2: Core Persistence + Intake Service + Submission Screen — PENDING
- [ ] Slice 3: Source Resolver + getInvestigation Read Path + Blocked/Generation-Failed States — PENDING
- [ ] Slice 4: Evidence/Claim Model + Extraction & Clustering Engine + Evidence Labeler — PENDING
- [ ] Slice 5: Demand Analyzer + Personal Pull Extractor — PENDING
- [ ] Slice 6: Landscape Researcher + Gap Hypothesis Generator — PENDING (Row 9 PROVISIONAL must be resolved before this slice begins — see DDR-0001)
- [ ] Slice 7: Uncertainty Compiler + Recommendation Engine — PENDING
- [ ] Slice 8: Provenance Recorder — PENDING
- [ ] Slice 9: Brief Assembler — PENDING
- [ ] Slice 10: Investigation Screen — Completed State — PENDING
- [ ] Slice 11: Decision Recorder + Decision Form + Decision Confirmation Panel — PENDING
- [ ] Slice 12: Validity/Invalidation Service + Decision-History Banner — PENDING

## Current
Slice: 1 COMPLETE, starting Slice 2
Step: @github-ops commit
Last updated: 2026-08-10

## Fix Attempts
| Test/File | Attempts | Last Error |
|-----------|----------|------------|

## Notes
- Spec: docs/specs/problem-department-mvp/ (Spec Gate PASSED attempt 3/3, NORTH-STAR Status: Locked)
- Runtime/storage decision: docs/decisions/DDR-0001-problem-department-runtime.md (ACCEPTED)
- Branch: feature/problem-department-mvp (off origin/main), draft PR #6
- Storage: dedicated local Postgres for Department OS Core provisioned during Slice 1 spike
  (Docker, postgres:16-alpine, port 55432, db deptos_core) — this was throwaway spike
  infrastructure per the roadmap's "not part of the shipped codebase" note; Slice 2 will need
  its own real provisioning decision (same container, or a persistent equivalent) as part of
  building the actual persistence layer.
