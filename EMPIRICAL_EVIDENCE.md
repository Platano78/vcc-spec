# Empirical Evidence: VCC in Production

## Reference Implementation

- System: AgentForge (https://github.com/Platano78/AgentForge)
- npm: forgeagent
- Version: 1.0.0-alpha.1 (March 2026)

---

## The Autoresearch Connection

VCC maps directly to the Karpathy autoresearch pattern across three dimensions:

- **Scriptable Asset** — one file, deterministically testable
- **Scalar Metric** — VCC pass/fail (binary, immutable once locked)
- **Time-Boxed Cycle** — one repair attempt per criterion per round

The evaluation function is locked before generation begins. The model never decides when it is done. VCC does.

This distinction is load-bearing. As Carlo Iacono observed: "A system that can rewrite both the exam and the answers will always pass." VCC separates authorship (model) from judgment (VerifyAtomFn). The contract is written by the engineer, not the model that will be evaluated against it. The model cannot pass by redefining the test.

---

## The Ralph Loop

The Ralph Loop is VCC-driven clean-context repair. The mechanism:

1. Generation completes. A criterion fails.
2. Context is wiped entirely — no conversation history, no prior attempts.
3. The broken file and the failing criterion are sent as the full prompt.
4. The model produces a two-step response: first diagnosis ("What is wrong?"), then the corrective patch ("Apply the fix").
5. The model re-evaluates the specific criterion against its own output (dogfooding via VerifyAtomFn callback).
6. If the criterion still fails, the new failure is fed back as the next iteration input.

Local LLMs provide unlimited free tokens. The pipeline exploits this: generate 95% correct on the first pass, repair the remaining 5% through targeted iteration. Each repair round costs zero cloud spend. The diagnosis step is not discarded — it is stored in the compound learning log and injected into future repair prompts for similar failures.

---

## Six-Gate Pipeline

The pipeline executes gates in fixed order. A gate failure blocks all subsequent gates. Repair runs inside Gate 5 only; earlier gates are hard stops.

| Gate | Name | Description |
|------|------|-------------|
| 1 | Compile | Syntax valid — `tsc --strict` / `py_compile` / `cargo check` |
| 2 | EPR | Entry Point Resolution — output files connect, imports resolve |
| 3 | DRG | Dependency Resolution Gate — registry HEAD checks for hallucinated packages |
| 4 | Smoke Gate | Binary execution — run the artifact, catch the crash |
| 5 | VCC Repair Gate | Criterion-by-criterion repair with Ralph Loop |
| 6 | Universal VCC | Final sweep against all acceptance criteria |

Gate ordering is intentional. A file that does not compile cannot be entry-point-checked. A file with phantom dependencies cannot smoke-test. Repair is gated behind smoke because a crashing artifact produces uninformative VCC failures.

---

## Benchmark Results

Ten runs across two models on five representative project types. Models ran on local hardware with no cloud API calls.

**Hardware:**
- OmniCoder-9B: RTX 3080 Ti 12GB (always-on inference server, port 8084)
- NousCoder-14B: RTX 5080 16GB (primary router, port 8081)

| Project | OmniCoder-9B | Time (9B) | NousCoder-14B | Time (14B) |
|---------|-------------|-----------|--------------|------------|
| Zeeter (Twitter clone) | PASS (96% criterion coverage) | 4.1 min | PASS | 17 min |
| RealWorld (19-endpoint REST API) | FAIL (36 TypeScript errors post-compile) | — | PASS | 7.3 min |
| Flight Sim (WebGL) | FAIL (instruction following breakdown) | — | PASS | 11.3 min |
| Browser OS (desktop simulation) | PASS | 1.8 min | PASS | 4.5 min |
| Bumper Cars (browser game) | PASS | 1.7 min | PASS (100%) | 17.8 min |
| **Total** | **3/5 (60%)** | | **5/5 (100%)** | |

**Key findings:**

- VCC convergence is consistent on every successful run. The repair loop terminates. Stagnation detection (no improvement for 3 rounds) prevents infinite loops.
- 9B failures are model quality failures, not pipeline failures. The pipeline correctly identified and reported them rather than producing false passes.
- Repair overhead is 3 to 7 seconds per criterion iteration. This is negligible relative to generation time.
- Compound learning log persists across runs. Diagnosed root causes from the Bumper Cars run were reused in a subsequent Zeeter repair session.
- Zero cloud dependencies. All inference, evaluation, and repair ran locally.

---

## Design Principles Validated

**Evaluation Lock** — The VerifyAtomFn is frozen before generation. The model cannot alter the evaluation function. This is the mechanism that prevents the autoresearch failure mode Iacono described.

**Phased Sweep** — MUST criteria evaluated before SHOULD criteria. A MUST failure blocks SHOULD evaluation. This prevents a model from accumulating SHOULD passes to mask a fundamental MUST failure.

**Binary Evals Over Scales** — Every criterion resolves to pass or fail. No partial credit, no confidence scores, no fuzzy thresholds. Binary evals compose cleanly: a project passes when all MUST criteria pass and all SHOULD criteria pass or are explicitly waived.

**Dogfooding** — The model receives its own failed output via the VerifyAtomFn callback. It sees exactly what the evaluator saw. This eliminates the hallucination failure mode where a model believes its output is correct without checking.

**Stagnation Detection** — If criterion state does not change for 3 consecutive repair rounds, the loop terminates and the failure is reported. This prevents resource exhaustion on pathological cases where the model oscillates between two broken states.

---

## Failure Modes Observed

Four distinct failure modes were encountered and resolved during implementation.

**1. Phantom Deliverable URIs**

Auto-spec generation pointed acceptance criteria at file paths that did not exist in the output. The VCC gate evaluated against a nonexistent artifact and produced confusing error output. Fixed by adding an artifact existence check as a pre-condition in Universal VCC before VerifyAtomFn is called.

**2. Inner Loop Blind Success**

An early version of the repair loop marked a criterion resolved after the model reported success in its diagnosis text, without re-running VerifyAtomFn. The model's self-assessment was accepted as ground truth. Fixed by enforcing that VerifyAtomFn is always the final arbiter — model claims are never accepted without independent verification.

**3. External Judge Dependency**

A criterion variant used Gemini as a semantic judge for non-code deliverables. A Gemini quota exhaustion mid-run caused the gate to throw and halt the pipeline. Fixed by (a) making external judge calls optional with a local fallback, and (b) treating judge unavailability as a gate skip rather than a gate failure.

**4. Critical Failure Blocking Repair**

An earlier gate ordering placed the VCC Repair Gate (Gate 5) before the Smoke Gate (Gate 4). A crashing artifact produced VCC failures that appeared to be criterion failures but were actually execution failures. The repair loop attempted to fix criterion issues in an artifact that could not run, producing nonsensical patches. Fixed by enforcing gate ordering: Smoke Gate must pass before VCC Repair Gate executes.

---

## Compound Learning Schema

Repair diagnostics are persisted as JSONL at `.agentforge/vcc-repair-log.jsonl`.

Each record:

```json
{
  "acId": "string",
  "rootCause": "string",
  "strategy": "string",
  "fix": "string",
  "success": true,
  "timestamp": "ISO 8601"
}
```

Up to 50 prior diagnoses matching the current criterion type are injected into the repair prompt context. This allows the model to recognize recurring failure patterns without relearning them from scratch on each run. The log is append-only. No entries are deleted or modified after writing.

---

## Open Questions

**1. Dependency-aware ordering via DeliverableSpec.dependsOn**

The current pipeline evaluates all deliverables in declaration order. Projects with deliverable dependency graphs (module A must pass before module B is meaningful) would benefit from topological sort ordering. `DeliverableSpec.dependsOn` is reserved in the schema but not yet wired into the evaluation scheduler.

**2. LLM-as-judge for non-code deliverables**

Binary VerifyAtomFn works cleanly for executable artifacts. Documentation quality, API design coherence, and UX copy do not have deterministic pass/fail functions. A controlled LLM-as-judge pattern (fixed prompt, fixed model, fixed temperature) would extend VCC to these deliverable types without sacrificing evaluation lock. The judge model must be separate from the generating model.

**3. Cross-run compound learning across different projects**

The current compound learning log is per-project. A shared learning index across projects would allow the system to apply repair strategies from a Zeeter run to a RealWorld run where the root cause is identical (e.g., TypeScript strict null handling). This requires a root cause taxonomy to match across dissimilar projects.
