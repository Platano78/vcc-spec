# Verifiable Completion Contracts (VCC)

**Version 1.0** | **License: MIT** | **Status: Draft Specification**

## What is VCC?

Verifiable Completion Contracts (VCC) is an open specification for defining when autonomous agent tasks are truly complete. Unlike procedural termination (iteration limits, timeouts), VCC defines **outcome-driven termination**: a task succeeds if and only if all required acceptance criteria are satisfied.

## The Problem VCC Solves

Current autonomous agent frameworks suffer from **silent success**: runs complete based on procedural conditions (task list exhausted, iteration limit reached) rather than verified outcomes. This leads to:

- Incomplete deliverables marked as "done"
- Quality thresholds ignored
- No audit trail for what was actually verified

## The VCC Solution

A VCC contract specifies:

| Component | Purpose |
|-----------|---------|
| **Deliverables** | Required outputs with formats, dependencies, ownership |
| **Acceptance Criteria** | MUST/SHOULD/MAY requirements with validators |
| **Evidence** | Required proof (auto, AI-judged, human, hybrid) |
| **Provenance** | Audit trail requirements (inputs, tooling, hashes) |
| **Resource Constraints** | Budgets for time, cost, iterations |

### The Termination Law

```
TerminateSuccess ⟺ Satisfied(MUST_criteria)
TerminateFailure ⟺ Exhausted(Resources) ∧ ¬Satisfied(MUST_criteria)
```

A run **cannot** succeed if any MUST criterion is failing.

## Quick Start

### 1. Define a Contract

```yaml
vccVersion: "sdlaf.vcc/v1"
id: "my-task-001"
title: "Generate API Documentation"

artifacts:
  - artifactId: "api-docs"
    kind: "documentation"
    required: true
    owners: ["role:TechWriter"]

acceptance:
  - acId: "AC-1"
    targetArtifacts: ["api-docs"]
    type: "structure"
    severity: "must"
    rule:
      requiredSections: ["Endpoints", "Authentication", "Examples"]

resourceConstraints:
  maxIterations: 5
  stagnationWindow: 2
```

### 2. Validate the Contract

```typescript
import { specIntegrityPass, buildDefaultRegistry } from 'vcc-validators';

const registry = buildDefaultRegistry();
const { spec, issues } = await specIntegrityPass(contract, ctx, registry);
```

### 3. Run Until Correct

```typescript
for (let t = 0; t < spec.resourceConstraints.maxIterations; t++) {
  const failing = await evaluateMustCriteria(spec, outputs);
  if (failing.length === 0) return SUCCESS;
  if (isStagnant(failing, history)) return FAILURE;
  outputs = await refine(outputs, failing);
}
return FAILURE;
```

## Specification Files

| File | Description |
|------|-------------|
| `schemas/vcc-v1.schema.json` | JSON Schema for validation |
| `src/adapter-interfaces.ts` | TypeScript interface definitions |
| `src/spec-integrity-and-universal-validators.ts` | Reference validators |
| `examples/vcc_*.yml` | Domain-specific examples |

## Severity Levels

| Level | Meaning | Termination Impact |
|-------|---------|-------------------|
| `must` | Required for success | Blocks successful termination |
| `should` | Expected but not blocking | Logged as warning |
| `may` | Nice to have | Informational only |

## Validator Types

| Type | Description | Evidence |
|------|-------------|----------|
| `schema` | JSON Schema validation | Auto |
| `structure` | Required sections/fields | Auto |
| `traceability` | Citation coverage | Auto |
| `consistency` | Cross-artifact checks | Auto/AI |
| `provenance` | Audit trail verification | Auto |
| `rubric` | AI-judged quality scoring | AI-judged |
| `custom` | Domain-specific validators | Configurable |

## Reference Implementation

A production implementation is available in [SDLAF](https://github.com/SDLAF/sdlaf) v3.0.

## Related Work

VCC builds on established foundations:

- **Design by Contract** (Meyer, 1992) - postconditions for correctness
- **TLA+/Alloy** - lightweight formal specifications
- **CI/CD Gates** - acceptance testing for deployments
- **Structured Outputs** - JSON Schema for syntax; VCC for semantics

## Contributing

VCC is an open specification. Contributions welcome:

- [GitHub Issues](https://github.com/SDLAF/vcc-spec/issues) - Bug reports, feature requests
- [Pull Requests](https://github.com/SDLAF/vcc-spec/pulls) - Schema improvements, new validators

## License

MIT License - See [LICENSE](LICENSE) for details.

---

**Created by the SDLAF Project** | [Documentation](https://sdlaf.dev/vcc) | [GitHub](https://github.com/SDLAF/vcc-spec)
