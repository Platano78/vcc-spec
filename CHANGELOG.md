# Changelog (v2)

## v1.0 (2026-01-13)
- Paper Section 7 updated with observed E2E validation results (Table 2)
- Termination law empirically verified: SUCCESS ⟺ Satisfied(C_M)
- Task 1: SUCCESS (73/100, 1 iteration), Task 2: FAILURE (54/100, 5 iterations)
- Bug discovered and fixed: artifacts/deliverables schema normalization
- Added validation-evidence directory with raw logs and deliverables
- Added versioning statement for future compatibility
- Evidence files included in supplementary materials

- Paper terminology aligned with SDLAF implementation: *deliverable* (syn. artifact).
- Rubric AI judge validator changed from pure placeholder to provider-agnostic injectable adapter via `RunContext.aiJudge`.
  - If not configured, returns SKIP with explicit evidence.
  - If configured, returns PASS/FAIL with score and rationale evidence.
