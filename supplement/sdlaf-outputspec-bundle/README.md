# SDLAF OutputSpec Bundle

This bundle contains:

## Specs
- `schemas/sdlaf-outputspec-v1.schema.json` — JSON Schema (Draft 2020-12) for OutputSpec v1.

## TypeScript
- `src/adapter-interfaces.ts` — Domain-agnostic adapter interfaces (planner/executor/validator/packager/deliverer).
- `src/spec-integrity-and-universal-validators.ts` — Fixed integrity pass + universal validators (no stray glyphs).

## Examples
- `examples/outputspec_research.yml`
- `examples/outputspec_hardware.yml`
- `examples/outputspec_software.yml`

## Notes
- The `rubric.aiJudge` validator is a placeholder until wired to your LLM evaluation pipeline.
- The `schema.jsonSchema` validator is optional and will attempt to dynamically import `ajv`.
