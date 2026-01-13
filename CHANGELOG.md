# Changelog (v2)

- Paper terminology aligned with SDLAF implementation: *deliverable* (syn. artifact).
- Rubric AI judge validator changed from pure placeholder to provider-agnostic injectable adapter via `RunContext.aiJudge`.
  - If not configured, returns SKIP with explicit evidence.
  - If configured, returns PASS/FAIL with score and rationale evidence.
