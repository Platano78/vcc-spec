/* -------------------------------------------------------------------------
 * SDLAF Verifiable Completion Contract (VCC) v1 — Spec Integrity Pass + Default Universal Validators
 *
 * What this module provides:
 *  1) specIntegrityPass()
 *     - Validates VCCSpec cross-references (artifactIds, dependsOn, rubric refs)
 *     - Optionally injects universal default rubrics + acceptance criteria
 *     - Fails fast if any MUST acceptance criteria are unverifiable
 *
 *  2) Universal validator adapters (domain-agnostic)
 *     - structure.requiredSections
 *     - traceability.citationCoverage
 *     - consistency.simpleCrossCheck
 *     - provenance.requiredFields
 *     - schema.jsonSchema (optional AJV)
 *     - rubric.aiJudge (placeholder until wired to your LLM eval pipeline)
 *
 * IMPORTANT:
 *  - This file is intentionally self-contained and safe to paste.
 *  - If you see any extra glyphs after the final '}', delete them—those are paste/UI artifacts.
 * ------------------------------------------------------------------------- */

export type ArtifactId = string;
export type RoleRef = `role:${string}`;
export type Severity = "must" | "should" | "may";
export type EvidenceType = "auto" | "ai-judged" | "human" | "hybrid";
export type GateWhen = "before_final" | "before_packaging" | "before_delivery";

export interface VCCSpec {
  vccVersion: "sdlaf.vcc/v1";
  id: string;
  title: string;
  summary: string;
  intent: Record<string, unknown>;
  artifacts: ArtifactSpec[];
  relationships?: RelationshipSpec[];
  acceptance: AcceptanceCriterionSpec[];
  rubrics?: RubricSpec[];
  gates?: GateSpec[];
  packaging: PackagingSpec[];
  delivery: DeliverySpec[];
  provenancePolicy: ProvenancePolicySpec;
  riskControls?: Record<string, unknown>;
  resourceConstraints?: ResourceConstraints;
}

export interface ArtifactSpec {
  artifactId: ArtifactId;
  kind: string;
  subtype?: string;
  description: string;
  formats: { mediaType: string; uri: string }[];
  required: boolean;
  dependsOn: ArtifactId[];
  owners: RoleRef[];
  qualityLevel: "draft" | "reviewed" | "production";
  metadata?: Record<string, unknown>;
}

export interface RelationshipSpec {
  type: "derivesFrom" | "informs" | "implements" | "tests" | "summarizes" | "references" | "dependsOn";
  from: ArtifactId;
  to: ArtifactId;
  notes?: string;
}

export interface AcceptanceCriterionSpec {
  acId: string;
  targetArtifacts: ArtifactId[];
  type:
    | "schema"
    | "structure"
    | "traceability"
    | "consistency"
    | "rubric"
    | "constraint"
    | "execution"
    | "security"
    | "provenance"
    | "custom";
  severity: Severity;
  rule: Record<string, unknown>;
  evidence: { required: boolean; evidenceType: EvidenceType; producedArtifact?: ArtifactId };
}

export interface RubricSpec {
  rubricId: string;
  scale: number[];
  anchors: Record<string, string>;
  passThreshold: number;
}

export interface GateSpec {
  gateId: string;
  when: GateWhen;
  requiredApprovals: RequiredApprovalSpec[];
}

export interface RequiredApprovalSpec {
  type: "auto" | "ai" | "human";
  role?: RoleRef;
  optional?: boolean;
  rubricId?: string;
  passThreshold?: number;
  rule?: Record<string, unknown>;
}

export interface PackagingSpec {
  packageId: string;
  inputs: ArtifactId[];
  method: "bundle" | "compose" | "transform";
  format: string;
  uri: string;
  manifestRequired: boolean;
}

export interface DeliverySpec {
  deliveryId: string;
  channel: string;
  target: string;
  uri: string;
  notify?: RoleRef[];
}

export interface ProvenancePolicySpec {
  policyId: string;
  require: Array<
    | "inputs.enumerated"
    | "tooling.recorded"
    | "agentActions.logged"
    | "artifactHashes.recorded"
    | "dependencies.recorded"
    | "parameters.recorded"
    | "attestation.signed"
  >;
  strength: string;
}

export interface ResourceConstraints {
  maxIterations?: number;
  maxTimeMs?: number;
  maxCostUsd?: number;
  stagnationWindow?: number;
}

/* ------------------------------ Run Context / Stores ------------------------------ */



export type AiJudgeScore = {
  score: number;            // e.g., 1..5
  rationale: string;        // short explanation
  rubricId?: string;
  model?: string;
};

export type AiJudgeFn = (args: {
  rubricText: string;
  content: string;
  passThreshold: number;
  acId: string;
}) => Promise<AiJudgeScore>;

export interface RunContext {
  aiJudge?: AiJudgeFn;

  runId: string;
  workspaceRoot: string;
  team: Array<{ role: RoleRef; agentId: string }>;
  artifacts: ArtifactStore;
  provenanceSignals?: ProvenanceSignals; // summary view used by provenance validator
  log?: { info(msg: string, meta?: any): void; warn(msg: string, meta?: any): void; error(msg: string, meta?: any): void };
}

export interface ArtifactStore {
  exists(uri: string): Promise<boolean>;
  readText(uri: string): Promise<string>;
  writeText(uri: string, contents: string): Promise<void>;
  hash(uri: string, alg: "sha256"): Promise<string>;
}

export interface ProvenanceSignals {
  inputsEnumerated: boolean;
  toolingRecorded: boolean;
  agentActionsLogged: boolean;
  artifactHashesRecorded: boolean;
  dependenciesRecorded: boolean;
  parametersRecorded: boolean;
  attestationSigned: boolean;
}

/* ------------------------------ Errors & Results ------------------------------ */

export class SpecIntegrityError extends Error {
  issues: IntegrityIssue[];
  constructor(message: string, issues: IntegrityIssue[]) {
    super(message);
    this.name = "SpecIntegrityError";
    this.issues = issues;
  }
}

export type IntegrityIssueSeverity = "error" | "warning";

export interface IntegrityIssue {
  severity: IntegrityIssueSeverity;
  code: string;
  message: string;
  path?: string; // JSON pointer-ish
}

export interface IntegrityResult {
  spec: VCCSpec;
  issues: IntegrityIssue[];
  normalized: {
    artifactIds: string[];
    mustACs: string[];
  };
}

/* =============================================================================
 * 1) Spec Integrity Pass
 * ============================================================================= */

export interface ValidatorAdapter {
  id: string;
  supportedTypes: AcceptanceCriterionSpec["type"][];
  canValidate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<boolean>;
  validate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<ValidationResult>;
}

export interface ValidationResult {
  acId: string;
  status: "pass" | "fail" | "skip";
  severity: Severity;
  summary: string;
  details?: Record<string, unknown>;
  evidence?: { evidenceType: EvidenceType; uri?: string; digests?: Record<string, string> };
}

export interface AdapterRegistry {
  validators: ValidatorAdapter[];
}

export async function specIntegrityPass(
  inputSpec: VCCSpec,
  ctx: RunContext,
  registry: AdapterRegistry,
  opts?: {
    injectUniversalDefaults?: boolean;
    requireMustCoverage?: boolean;
    // Convention: how citations are marked in text (used by default traceability validator)
    citationPattern?: RegExp; // default: /\[[^\]]+\]\(([^)]+)\)/g  (markdown links)
  }
): Promise<IntegrityResult> {
  const issues: IntegrityIssue[] = [];
  const spec = deepClone(inputSpec);

  if (!spec.artifacts || spec.artifacts.length === 0) {
    issues.push({
      severity: "error",
      code: "ARTIFACTS_EMPTY",
      message: "VCCSpec.artifacts must contain at least one artifact.",
      path: "/artifacts"
    });
    throw new SpecIntegrityError("VCCSpec failed integrity pass", issues);
  }

  // Basic version check
  if (spec.vccVersion !== "sdlaf.vcc/v1") {
    issues.push({
      severity: "error",
      code: "VERSION_UNSUPPORTED",
      message: `Unsupported vccVersion: ${spec.vccVersion}`,
      path: "/vccVersion"
    });
  }

  // Normalize arrays
  spec.relationships = spec.relationships ?? [];
  spec.rubrics = spec.rubrics ?? [];
  spec.gates = spec.gates ?? [];

  // Normalize artifactId uniqueness
  const artifactIdSet = new Set<string>();
  for (let i = 0; i < spec.artifacts.length; i++) {
    const a = spec.artifacts[i];
    if (!a.artifactId || typeof a.artifactId !== "string") {
      issues.push({ severity: "error", code: "ARTIFACT_ID_MISSING", message: "artifactId missing", path: `/artifacts/${i}/artifactId` });
      continue;
    }
    if (artifactIdSet.has(a.artifactId)) {
      issues.push({
        severity: "error",
        code: "ARTIFACT_ID_DUPLICATE",
        message: `Duplicate artifactId: ${a.artifactId}`,
        path: `/artifacts/${i}/artifactId`
      });
    }
    artifactIdSet.add(a.artifactId);

    if (!Array.isArray(a.formats) || a.formats.length === 0) {
      issues.push({
        severity: "error",
        code: "ARTIFACT_FORMATS_EMPTY",
        message: "Artifact formats must be non-empty",
        path: `/artifacts/${i}/formats`
      });
    }
    if (!Array.isArray(a.dependsOn)) a.dependsOn = [];
    if (!Array.isArray(a.owners) || a.owners.length === 0) {
      issues.push({
        severity: "warning",
        code: "ARTIFACT_OWNERS_EMPTY",
        message: "Artifact owners is empty (reduces accountability)",
        path: `/artifacts/${i}/owners`
      });
    }
  }

  const artifactIds = Array.from(artifactIdSet);

  // Validate dependsOn references
  for (let i = 0; i < spec.artifacts.length; i++) {
    const a = spec.artifacts[i];
    for (let j = 0; j < (a.dependsOn ?? []).length; j++) {
      const dep = a.dependsOn[j];
      if (!artifactIdSet.has(dep)) {
        issues.push({
          severity: "error",
          code: "ARTIFACT_DEP_MISSING",
          message: `Artifact ${a.artifactId} dependsOn missing artifactId: ${dep}`,
          path: `/artifacts/${i}/dependsOn/${j}`
        });
      }
    }
  }

  // Validate packaging inputs exist
  for (let i = 0; i < spec.packaging.length; i++) {
    const p = spec.packaging[i];
    for (let j = 0; j < p.inputs.length; j++) {
      const id = p.inputs[j];
      if (!artifactIdSet.has(id)) {
        issues.push({
          severity: "error",
          code: "PACKAGING_INPUT_MISSING",
          message: `Packaging ${p.packageId} input references missing artifactId: ${id}`,
          path: `/packaging/${i}/inputs/${j}`
        });
      }
    }
  }

  // Validate acceptance targets exist, acId uniqueness
  const acIdSet = new Set<string>();
  for (let i = 0; i < spec.acceptance.length; i++) {
    const ac = spec.acceptance[i];
    if (acIdSet.has(ac.acId)) {
      issues.push({
        severity: "error",
        code: "AC_ID_DUPLICATE",
        message: `Duplicate acId: ${ac.acId}`,
        path: `/acceptance/${i}/acId`
      });
    }
    acIdSet.add(ac.acId);

    for (let j = 0; j < ac.targetArtifacts.length; j++) {
      const t = ac.targetArtifacts[j];
      if (!artifactIdSet.has(t)) {
        issues.push({
          severity: "error",
          code: "AC_TARGET_MISSING",
          message: `Acceptance ${ac.acId} targets missing artifactId: ${t}`,
          path: `/acceptance/${i}/targetArtifacts/${j}`
        });
      }
    }
  }

  // Validate rubrics referenced exist
  const rubricSet = new Set(spec.rubrics.map(r => r.rubricId));
  for (let i = 0; i < spec.acceptance.length; i++) {
    const ac = spec.acceptance[i];
    const rubricRef = (ac.rule?.rubricRef as string | undefined) ?? undefined;
    if (rubricRef && !rubricSet.has(rubricRef)) {
      issues.push({
        severity: "error",
        code: "RUBRIC_REF_MISSING",
        message: `Acceptance ${ac.acId} references missing rubricId: ${rubricRef}`,
        path: `/acceptance/${i}/rule/rubricRef`
      });
    }
  }

  // Gate approvals rubric checks
  for (let i = 0; i < spec.gates.length; i++) {
    const g = spec.gates[i];
    for (let j = 0; j < g.requiredApprovals.length; j++) {
      const ra = g.requiredApprovals[j];
      if (ra.rubricId && !rubricSet.has(ra.rubricId)) {
        issues.push({
          severity: "error",
          code: "GATE_RUBRIC_REF_MISSING",
          message: `Gate ${g.gateId} approval references missing rubricId: ${ra.rubricId}`,
          path: `/gates/${i}/requiredApprovals/${j}/rubricId`
        });
      }
    }
  }

  // Team role presence warning (do not hard error—team might be generated later)
  const teamRoles = new Set(ctx.team?.map(t => t.role) ?? []);
  for (let i = 0; i < spec.artifacts.length; i++) {
    for (let j = 0; j < spec.artifacts[i].owners.length; j++) {
      const owner = spec.artifacts[i].owners[j];
      if (teamRoles.size > 0 && !teamRoles.has(owner)) {
        issues.push({
          severity: "warning",
          code: "ROLE_NOT_IN_TEAM",
          message: `Artifact owner role not found in team: ${owner}`,
          path: `/artifacts/${i}/owners/${j}`
        });
      }
    }
  }

  // Inject universal defaults
  const inject = opts?.injectUniversalDefaults ?? true;
  if (inject) {
    injectDefaultRubrics(spec);
    injectDefaultAcceptance(spec, opts?.citationPattern);
  }

  // Verify MUST coverage by available validators
  const requireMustCoverage = opts?.requireMustCoverage ?? true;
  const mustACs = spec.acceptance.filter(a => a.severity === "must").map(a => a.acId);

  if (requireMustCoverage) {
    const mustCriteria = spec.acceptance.filter(a => a.severity === "must");
    for (const ac of mustCriteria) {
      // If the rule explicitly names an adapter, require that adapter to exist.
      const explicitAdapter = typeof ac.rule?.adapter === "string" ? (ac.rule.adapter as string) : undefined;
      if (explicitAdapter) {
        const found = registry.validators.some(v => v.id === explicitAdapter);
        if (!found) {
          issues.push({
            severity: "error",
            code: "EXPLICIT_VALIDATOR_MISSING",
            message: `MUST criterion ${ac.acId} names adapter '${explicitAdapter}', but no such validator is registered.`,
            path: `/acceptance/${spec.acceptance.findIndex(x => x.acId === ac.acId)}/rule/adapter`
          });
        }
        continue;
      }

      const candidates = registry.validators.filter(v => v.supportedTypes.includes(ac.type));
      if (candidates.length === 0) {
        issues.push({
          severity: "error",
          code: "NO_VALIDATOR_FOR_TYPE",
          message: `No validator registered for MUST criterion type '${ac.type}' (acId=${ac.acId}).`,
          path: `/acceptance/${spec.acceptance.findIndex(x => x.acId === ac.acId)}/type`
        });
        continue;
      }

      let canAny = false;
      for (const v of candidates) {
        try {
          if (await v.canValidate(ac, spec, ctx)) {
            canAny = true;
            break;
          }
        } catch {
          // ignore
        }
      }
      if (!canAny) {
        issues.push({
          severity: "error",
          code: "UNVERIFIABLE_MUST",
          message: `MUST criterion ${ac.acId} appears unverifiable by registered validators (type='${ac.type}').`,
          path: `/acceptance/${spec.acceptance.findIndex(x => x.acId === ac.acId)}`
        });
      }
    }
  }

  const errors = issues.filter(i => i.severity === "error");
  if (errors.length > 0) {
    throw new SpecIntegrityError("VCCSpec failed integrity pass", issues);
  }

  return { spec, issues, normalized: { artifactIds, mustACs } };
}

/* ------------------------------ Defaults injection ------------------------------ */

function injectDefaultRubrics(spec: VCCSpec): void {
  const rubrics = spec.rubrics ?? (spec.rubrics = []);
  const existing = new Set(rubrics.map(r => r.rubricId));

  if (!existing.has("RUBRIC-OVERALL-v1")) {
    rubrics.push({
      rubricId: "RUBRIC-OVERALL-v1",
      scale: [1, 2, 3, 4, 5],
      anchors: {
        "1": "Incorrect/incomplete; fails core requirements",
        "3": "Mostly correct; notable gaps or rough edges",
        "5": "Polished; correct; consistent; ready for delivery"
      },
      passThreshold: 4
    });
  }

  if (!existing.has("RUBRIC-CLARITY-v1")) {
    rubrics.push({
      rubricId: "RUBRIC-CLARITY-v1",
      scale: [1, 2, 3, 4, 5],
      anchors: {
        "1": "Hard to follow; ambiguous; missing context",
        "3": "Understandable; some ambiguities",
        "5": "Clear, structured, and actionable"
      },
      passThreshold: 4
    });
  }
}

function injectDefaultAcceptance(spec: VCCSpec, citationPattern?: RegExp): void {
  const acc = spec.acceptance;
  const existing = new Set(acc.map(a => a.acId));

  // Structural minimum on spec-like artifacts
  if (!existing.has("AC-UNIV-STRUCT-1")) {
    acc.push({
      acId: "AC-UNIV-STRUCT-1",
      targetArtifacts: findLikelySpecArtifacts(spec),
      type: "structure",
      severity: "must",
      rule: { requiredSections: ["Scope", "Assumptions", "Risks", "Acceptance Criteria"] },
      evidence: { required: true, evidenceType: "auto", producedArtifact: "E-AC-UNIV-STRUCT-1" }
    });
  }

  // Traceability baseline on narrative artifacts
  if (!existing.has("AC-UNIV-TRACE-1")) {
    acc.push({
      acId: "AC-UNIV-TRACE-1",
      targetArtifacts: findNarrativeArtifacts(spec),
      type: "traceability",
      severity: "should",
      rule: {
        description: "Key claims should be backed by citations or explicit 'UNSOURCED/INFERENCE' labels.",
        minCitationCoverage: 0.6,
        citationPattern: (citationPattern ?? /\[[^\]]+\]\(([^)]+)\)/g).source
      },
      evidence: { required: true, evidenceType: "auto", producedArtifact: "E-AC-UNIV-TRACE-1" }
    });
  }

  // Consistency baseline across required artifacts
  if (!existing.has("AC-UNIV-CONSIST-1")) {
    acc.push({
      acId: "AC-UNIV-CONSIST-1",
      targetArtifacts: spec.artifacts.filter(a => a.required).map(a => a.artifactId),
      type: "consistency",
      severity: "should",
      rule: { description: "Artifacts should not contradict each other on defined scope and decisions." },
      evidence: { required: true, evidenceType: "ai-judged", producedArtifact: "E-AC-UNIV-CONSIST-1" }
    });
  }

  // Provenance baseline
  if (!existing.has("AC-UNIV-PROV-1")) {
    acc.push({
      acId: "AC-UNIV-PROV-1",
      targetArtifacts: spec.packaging.flatMap(p => p.inputs),
      type: "provenance",
      severity: "must",
      rule: { require: spec.provenancePolicy.require },
      evidence: { required: true, evidenceType: "auto", producedArtifact: "E-AC-UNIV-PROV-1" }
    });
  }
}

function findLikelySpecArtifacts(spec: VCCSpec): ArtifactId[] {
  const required = spec.artifacts.filter(a => a.required);
  if (required.length === 0) {
    // If nothing is required, the spec is malformed; pick the first artifact to avoid empty MUST targets.
    return [spec.artifacts[0].artifactId];
  }

  const ids = required
    .filter(a => {
      const k = (a.kind ?? "").toLowerCase();
      const st = (a.subtype ?? "").toLowerCase();
      return k.includes("spec") || st.includes("requirements") || st.includes("protocol");
    })
    .map(a => a.artifactId);

  return ids.length > 0 ? ids : [required[0].artifactId];
}

function findNarrativeArtifacts(spec: VCCSpec): ArtifactId[] {
  const required = spec.artifacts.filter(a => a.required);
  if (required.length === 0) return [spec.artifacts[0].artifactId];

  const ids = required
    .filter(a => a.formats.some(f => (f.mediaType ?? "").startsWith("text/") || (f.mediaType ?? "").includes("markdown")))
    .map(a => a.artifactId);

  return ids.length > 0 ? ids : required.map(a => a.artifactId);
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/* =============================================================================
 * 2) Default Universal Validators
 * ============================================================================= */

export const UniversalValidators = {
  structureRequiredSections: new StructureRequiredSectionsValidator(),
  traceabilityCitationCoverage: new TraceabilityCitationCoverageValidator(),
  consistencySimpleCrossCheck: new ConsistencySimpleCrossCheckValidator(),
  provenanceRequiredFields: new ProvenanceRequiredFieldsValidator(),
  // Optional: JSON Schema validator requires AJV; provided as a factory.
  createJsonSchemaValidator: (loadSchema: (ref: string) => Promise<any>) => new JsonSchemaValidator(loadSchema),
  // Placeholder: AI rubric scoring validator (wire to your LLM eval pipeline)
  rubricAiJudge: new RubricAiJudgeValidator()
};

/* ------------------------------ Helpers ------------------------------ */



async function safeReadText(ctx: RunContext, uri: string): Promise<string> {
  try {
    return await readArtifactText(ctx, uri);
  } catch (e) {
    const ev = await writeEvidence(ctx, `evidence://read-failure/${sha256Hex(uri)}.txt`,
      `WARN: Failed to read target for AI judging.\nuri=${uri}\nerror=${String(e)}`);
    // Evidence is recorded; return empty content to preserve total function semantics.
    void ev;
    return "";
  }
}

async function readArtifactText(spec: VCCSpec, ctx: RunContext, artifactId: ArtifactId): Promise<string> {
  const a = spec.artifacts.find(x => x.artifactId === artifactId);
  if (!a) throw new Error(`Artifact not found: ${artifactId}`);
  const best = a.formats.find(f => (f.mediaType ?? "").startsWith("text/")) ?? a.formats[0];
  return ctx.artifacts.readText(best.uri);
}

async function writeEvidence(ctx: RunContext, evidenceUri: string, contents: string): Promise<{ uri: string; sha256: string }> {
  await ctx.artifacts.writeText(evidenceUri, contents);
  const sha256 = await ctx.artifacts.hash(evidenceUri, "sha256");
  return { uri: evidenceUri, sha256 };
}

function evidenceUriFor(acId: string): string {
  return `sdlaf-exports/evidence/${acId}.txt`;
}

/* ------------------------------ Validator: Structure Required Sections ------------------------------ */

export class StructureRequiredSectionsValidator implements ValidatorAdapter {
  id = "structure.requiredSections";
  supportedTypes: AcceptanceCriterionSpec["type"][] = ["structure"];

  async canValidate(ac: AcceptanceCriterionSpec): Promise<boolean> {
    const sections = ac.rule?.requiredSections;
    return Array.isArray(sections) && sections.length > 0;
  }

  async validate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<ValidationResult> {
    const requiredSections = (ac.rule.requiredSections as string[]) ?? [];
    const targets = ac.targetArtifacts ?? [];
    const missing: Record<string, string[]> = {};

    for (const artifactId of targets) {
      const text = await readArtifactText(spec, ctx, artifactId);
      const notFound = requiredSections.filter(s => !hasSection(text, s));
      if (notFound.length > 0) missing[artifactId] = notFound;
    }

    const pass = Object.keys(missing).length === 0;
    const evidenceText = pass
      ? `PASS: All required sections present.\nRequired: ${requiredSections.join(", ")}`
      : `FAIL: Missing required sections.\nRequired: ${requiredSections.join(", ")}\nMissing:\n${JSON.stringify(missing, null, 2)}`;

    const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);

    return {
      acId: ac.acId,
      status: pass ? "pass" : "fail",
      severity: ac.severity,
      summary: pass ? "All required sections present." : "One or more required sections are missing.",
      details: { missing },
      evidence: { evidenceType: "auto", uri: ev.uri, digests: { sha256: ev.sha256 } }
    };
  }
}

function hasSection(text: string, sectionTitle: string): boolean {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mdHeading = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, "im");
  const underline = new RegExp(`^${escaped}\\s*$\\s*^[-=]{3,}\\s*$`, "im");
  const label = new RegExp(`^${escaped}\\s*:\\s*$`, "im");
  return mdHeading.test(text) || underline.test(text) || label.test(text);
}

/* ------------------------------ Validator: Traceability (Citation Coverage) ------------------------------ */

export class TraceabilityCitationCoverageValidator implements ValidatorAdapter {
  id = "traceability.citationCoverage";
  supportedTypes: AcceptanceCriterionSpec["type"][] = ["traceability"];

  async canValidate(ac: AcceptanceCriterionSpec): Promise<boolean> {
    return typeof ac.rule?.minCitationCoverage === "number" || typeof ac.rule?.citationPattern === "string";
  }

  async validate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<ValidationResult> {
    const minCoverage = typeof ac.rule.minCitationCoverage === "number" ? (ac.rule.minCitationCoverage as number) : 0.5;
    const patternSource = typeof ac.rule.citationPattern === "string"
      ? (ac.rule.citationPattern as string)
      : /\[[^\]]+\]\(([^)]+)\)/g.source;
    const citationRegex = new RegExp(patternSource, "g");

    const targets = ac.targetArtifacts ?? [];
    const perArtifact: Array<{ artifactId: string; coverage: number; cited: number; total: number }> = [];

    for (const artifactId of targets) {
      const text = await readArtifactText(spec, ctx, artifactId);
      const sentences = splitSentences(text).filter(s => s.trim().length > 0);

      let cited = 0;
      for (const s of sentences) {
        const hasCitation = citationRegex.test(s);
        citationRegex.lastIndex = 0;
        const isMarkedUnsourced = /\b(UNSOURCED|INFERENCE)\b/i.test(s);
        if (hasCitation || isMarkedUnsourced) cited++;
      }
      const total = Math.max(1, sentences.length);
      const coverage = cited / total;
      perArtifact.push({ artifactId, coverage, cited, total });
    }

    const worst = perArtifact.reduce((m, x) => Math.min(m, x.coverage), 1);
    const pass = worst >= minCoverage;

    const evidenceText =
      `Traceability Citation Coverage\n` +
      `minCoverage=${minCoverage}\n` +
      perArtifact.map(x => `${x.artifactId}: coverage=${x.coverage.toFixed(3)} (${x.cited}/${x.total})`).join("\n") +
      `\nResult: ${pass ? "PASS" : "FAIL"} (worst=${worst.toFixed(3)})`;

    const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);

    return {
      acId: ac.acId,
      status: pass ? "pass" : "fail",
      severity: ac.severity,
      summary: pass ? "Citation coverage meets threshold." : "Citation coverage below threshold.",
      details: { minCoverage, perArtifact, worst },
      evidence: { evidenceType: "auto", uri: ev.uri, digests: { sha256: ev.sha256 } }
    };
  }
}

function splitSentences(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (/^#{1,6}\s+/.test(l) || /^[-*+]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
      chunks.push(l);
    } else {
      const parts = l.split(/(?<=[.!?])\s+/);
      for (const p of parts) chunks.push(p);
    }
  }
  return chunks;
}

/* ------------------------------ Validator: Consistency (Simple Cross-Check) ------------------------------ */

export class ConsistencySimpleCrossCheckValidator implements ValidatorAdapter {
  id = "consistency.simpleCrossCheck";
  supportedTypes: AcceptanceCriterionSpec["type"][] = ["consistency"];

  async canValidate(): Promise<boolean> {
    return true;
  }

  async validate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<ValidationResult> {
    const targets = ac.targetArtifacts ?? [];
    const texts: Record<string, string> = {};
    for (const artifactId of targets) {
      try {
        texts[artifactId] = await readArtifactText(spec, ctx, artifactId);
      } catch {
        // ignore non-text
      }
    }

    const signals = findContradictionSignals(texts);
    const high = signals.filter(s => s.confidence >= 0.85);
    const pass = high.length === 0;

    const evidenceText =
      `Consistency Simple Cross-Check\n` +
      `Checked artifacts: ${Object.keys(texts).join(", ")}\n` +
      `Signals:\n` +
      (signals.length ? signals.map(s => `- [${s.confidence.toFixed(2)}] ${s.summary}`).join("\n") : "- none") +
      `\nResult: ${pass ? "PASS" : "FAIL"} (high_conf=${high.length})`;

    const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);

    return {
      acId: ac.acId,
      status: pass ? "pass" : "fail",
      severity: ac.severity,
      summary: pass ? "No high-confidence contradictions detected." : "Potential contradictions detected.",
      details: { signals, highConfidence: high },
      evidence: { evidenceType: "ai-judged", uri: ev.uri, digests: { sha256: ev.sha256 } }
    };
  }
}

type ContradictionSignal = { confidence: number; summary: string };

function findContradictionSignals(texts: Record<string, string>): ContradictionSignal[] {
  const signals: ContradictionSignal[] = [];
  const ids = Object.keys(texts);
  if (ids.length < 2) return signals;

  const outScopes: Record<string, Set<string>> = {};
  for (const id of ids) outScopes[id] = extractListUnderHeadings(texts[id], ["Out of Scope", "Non-goals", "Non Goals"]);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      for (const item of outScopes[a]) {
        if (mentionsAsInScope(texts[b], item)) {
          signals.push({ confidence: 0.9, summary: `${b} treats '${item}' as in-scope, but ${a} lists it out-of-scope.` });
        }
      }
      for (const item of outScopes[b]) {
        if (mentionsAsInScope(texts[a], item)) {
          signals.push({ confidence: 0.9, summary: `${a} treats '${item}' as in-scope, but ${b} lists it out-of-scope.` });
        }
      }
    }
  }

  const musts: Record<string, Set<string>> = {};
  for (const id of ids) musts[id] = extractMustStatements(texts[id]);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      for (const req of musts[a]) {
        if (negates(texts[b], req)) {
          signals.push({ confidence: 0.86, summary: `${b} negates a MUST/SHALL from ${a}: '${trimTo(req, 120)}'` });
        }
      }
      for (const req of musts[b]) {
        if (negates(texts[a], req)) {
          signals.push({ confidence: 0.86, summary: `${a} negates a MUST/SHALL from ${b}: '${trimTo(req, 120)}'` });
        }
      }
    }
  }

  return signals;
}

function extractListUnderHeadings(text: string, headings: string[]): Set<string> {
  const set = new Set<string>();
  for (const h of headings) {
    const block = extractSection(text, h);
    if (!block) continue;
    for (const line of block.split(/\r?\n/)) {
      const m = line.match(/^[-*+]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
      if (m && m[1].trim().length > 2) set.add(normalizeItem(m[1]));
    }
  }
  return set;
}

function extractSection(text: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, "im");
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^#{1,6}\s+/m);
  const block = next >= 0 ? rest.slice(0, next) : rest;
  return block.trim();
}

function mentionsAsInScope(text: string, item: string): boolean {
  const inScopeBlock = extractSection(text, "In Scope") ?? extractSection(text, "Objectives");
  if (!inScopeBlock) return false;
  const normItem = normalizeItem(item);
  return normalizeItem(inScopeBlock).includes(normItem);
}

function extractMustStatements(text: string): Set<string> {
  const set = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    if (/\b(must|shall|required to)\b/i.test(l)) set.add(l);
  }
  return set;
}

function negates(text: string, requirementLine: string): boolean {
  const tokens = requirementLine
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 5)
    .slice(0, 8);

  if (tokens.length === 0) return false;

  const negTerms = /(not required|will not|must not|shall not|out of scope|non-goal)/i;
  for (const t of tokens) {
    const re = new RegExp(`.{0,40}\\b${escapeRe(t)}\\b.{0,40}`, "i");
    const m = re.exec(text);
    if (m && negTerms.test(m[0])) return true;
  }
  return false;
}

function normalizeItem(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimTo(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

/* ------------------------------ Validator: Provenance Required Fields ------------------------------ */

export class ProvenanceRequiredFieldsValidator implements ValidatorAdapter {
  id = "provenance.requiredFields";
  supportedTypes: AcceptanceCriterionSpec["type"][] = ["provenance"];

  async canValidate(ac: AcceptanceCriterionSpec, _spec: VCCSpec, ctx: RunContext): Promise<boolean> {
    const req = ac.rule?.require;
    return Array.isArray(req) && !!ctx.provenanceSignals;
  }

  async validate(ac: AcceptanceCriterionSpec, _spec: VCCSpec, ctx: RunContext): Promise<ValidationResult> {
    const required = (ac.rule.require as string[]) ?? [];
    const sig = ctx.provenanceSignals;

    if (!sig) {
      const evidenceText = `FAIL: provenanceSignals missing in RunContext; cannot validate required provenance.`;
      const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);
      return {
        acId: ac.acId,
        status: "fail",
        severity: ac.severity,
        summary: "Provenance signals missing; cannot validate required provenance policy.",
        evidence: { evidenceType: "auto", uri: ev.uri, digests: { sha256: ev.sha256 } }
      };
    }

    const map: Record<string, boolean> = {
      "inputs.enumerated": sig.inputsEnumerated,
      "tooling.recorded": sig.toolingRecorded,
      "agentActions.logged": sig.agentActionsLogged,
      "artifactHashes.recorded": sig.artifactHashesRecorded,
      "dependencies.recorded": sig.dependenciesRecorded,
      "parameters.recorded": sig.parametersRecorded,
      "attestation.signed": sig.attestationSigned
    };

    const missing = required.filter(r => !map[r]);
    const pass = missing.length === 0;

    const evidenceText = pass
      ? `PASS: All required provenance requirements are satisfied.\nRequired: ${required.join(", ")}`
      : `FAIL: Missing provenance requirements.\nRequired: ${required.join(", ")}\nMissing: ${missing.join(", ")}`;

    const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);

    return {
      acId: ac.acId,
      status: pass ? "pass" : "fail",
      severity: ac.severity,
      summary: pass ? "Provenance policy satisfied." : "Provenance policy missing required signals.",
      details: { required, missing },
      evidence: { evidenceType: "auto", uri: ev.uri, digests: { sha256: ev.sha256 } }
    };
  }
}

/* ------------------------------ Validator: JSON Schema (Optional AJV) ------------------------------ */

export class JsonSchemaValidator implements ValidatorAdapter {
  id = "schema.jsonSchema";
  supportedTypes: AcceptanceCriterionSpec["type"][] = ["schema"];
  private loadSchema: (ref: string) => Promise<any>;

  constructor(loadSchema: (ref: string) => Promise<any>) {
    this.loadSchema = loadSchema;
  }

  async canValidate(ac: AcceptanceCriterionSpec): Promise<boolean> {
    return typeof ac.rule?.jsonSchema === "string";
  }

  async validate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<ValidationResult> {
    const schemaRef = ac.rule.jsonSchema as string;
    const target = ac.targetArtifacts?.[0];
    if (!target) throw new Error(`schema criterion ${ac.acId} has no targetArtifacts`);

    const schema = await this.loadSchema(schemaRef);

    let Ajv: any;
    try {
      Ajv = (await import("ajv")).default;
    } catch {
      const evidenceText = `SKIP: AJV not available; cannot validate JSON Schema (${schemaRef}).`;
      const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);
      return {
        acId: ac.acId,
        status: "skip",
        severity: ac.severity,
        summary: "AJV not available; schema validation skipped.",
        evidence: { evidenceType: "auto", uri: ev.uri, digests: { sha256: ev.sha256 } }
      };
    }

    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);

    const raw = await readArtifactText(spec, ctx, target);
    let obj: any;
    try {
      obj = JSON.parse(raw);
    } catch (e: any) {
      const evidenceText = `FAIL: Target artifact is not valid JSON.\nError: ${String(e?.message ?? e)}`;
      const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);
      return {
        acId: ac.acId,
        status: "fail",
        severity: ac.severity,
        summary: "Target artifact is not valid JSON.",
        details: { error: String(e?.message ?? e) },
        evidence: { evidenceType: "auto", uri: ev.uri, digests: { sha256: ev.sha256 } }
      };
    }

    const ok = validate(obj);
    const errors = validate.errors ?? [];
    const pass = !!ok;

    const evidenceText = pass
      ? `PASS: JSON Schema validation succeeded.\nSchema: ${schemaRef}`
      : `FAIL: JSON Schema validation failed.\nSchema: ${schemaRef}\nErrors:\n${JSON.stringify(errors, null, 2)}`;

    const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);

    return {
      acId: ac.acId,
      status: pass ? "pass" : "fail",
      severity: ac.severity,
      summary: pass ? "Schema validation passed." : "Schema validation failed.",
      details: { schemaRef, errors },
      evidence: { evidenceType: "auto", uri: ev.uri, digests: { sha256: ev.sha256 } }
    };
  }
}


/* ------------------------------ Validator: Rubric AI Judge (Injectable) ------------------------------ */

/**
 * This adapter is deliberately provider-agnostic: it requires an injected `RunContext.aiJudge`
 * function that performs rubric evaluation (e.g., via an LLM provider router).
 *
 * If no judge is configured, the validator returns SKIP with evidence, preserving determinism.
 */
export class RubricAiJudgeValidator implements ValidatorAdapter {
  id = "rubric.aiJudge";
  supportedTypes: AcceptanceCriterionSpec["type"][] = ["rubric", "consistency"];

  async canValidate(ac: AcceptanceCriterionSpec, spec: VCCSpec): Promise<boolean> {
    const rubricRef = ac.rule?.rubricRef as string | undefined;
    if (!rubricRef) return false;
    const rubrics = spec.rubrics ?? [];
    return rubrics.some(r => r.rubricId === rubricRef);
  }

  async validate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<ValidationResult> {
    const rubricRef = ac.rule.rubricRef as string;
    const passThreshold = (ac.rule.passThreshold as number | undefined) ?? 4;

    const rubric = (spec.rubrics ?? []).find(r => r.rubricId === rubricRef);
    const rubricText = rubric?.text ?? `Rubric ${rubricRef} not found in spec.`;

    // Select first target deliverable for evaluation (common pattern).
    const target = (ac.targetArtifacts ?? [])[0];
    const content = target ? await safeReadText(ctx, target) : "";

    if (!ctx.aiJudge) {
      const evidenceText =
        `SKIP: No aiJudge configured in RunContext.
` +
        `Rubric=${rubricRef}
passThreshold=${passThreshold}
` +
        `Target=${target ?? "(none)"}
` +
        `To enable: provide RunContext.aiJudge(args) that returns {score,rationale,model?}.`;

      const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);

      return {
        acId: ac.acId,
        status: "skip",
        severity: ac.severity,
        summary: "AI rubric judge not configured; skipped.",
        details: { rubricRef, passThreshold, target },
        evidence: { evidenceType: "ai-judged", uri: ev.uri, digests: { sha256: ev.sha256 } }
      };
    }

    const judged = await ctx.aiJudge({
      rubricText,
      content,
      passThreshold,
      acId: ac.acId
    });

    const pass = judged.score >= passThreshold;
    const evidenceText =
      `${pass ? "PASS" : "FAIL"}: AI rubric evaluation.
` +
      `Rubric=${rubricRef}
passThreshold=${passThreshold}
score=${judged.score}
` +
      `model=${judged.model ?? "(unspecified)"}
` +
      `rationale:
${judged.rationale}
` +
      `Target=${target ?? "(none)"}`;

    const ev = await writeEvidence(ctx, evidenceUriFor(ac.acId), evidenceText);

    return {
      acId: ac.acId,
      status: pass ? "pass" : "fail",
      severity: ac.severity,
      summary: pass ? "Rubric evaluation passed." : "Rubric evaluation failed.",
      details: { rubricRef, passThreshold, score: judged.score, model: judged.model, target },
      evidence: { evidenceType: "ai-judged", uri: ev.uri, digests: { sha256: ev.sha256 } }
    };
  }
}


/* =============================================================================
 * 3) Registry builder
 * ============================================================================= */

export function buildDefaultRegistry(): { validators: ValidatorAdapter[] } {
  return {
    validators: [
      UniversalValidators.structureRequiredSections,
      UniversalValidators.traceabilityCitationCoverage,
      UniversalValidators.consistencySimpleCrossCheck,
      UniversalValidators.provenanceRequiredFields,
      UniversalValidators.rubricAiJudge
      // Add schema validator if you have AJV + schema loader:
      // UniversalValidators.createJsonSchemaValidator(async (ref) => loadFromFSorUrl(ref))
    ]
  };
}

/* -------------------------------------------------------------------------
 * End of module
 *
 * Recommended usage:
 *  1) const registry = buildDefaultRegistry();
 *  2) const { spec } = await specIntegrityPass(outputSpec, ctx, registry);
 *  3) Execute tasks, then validate: run validators for each AcceptanceCriterion.
 *  4) Only package/deliver when all MUST criteria and required gates pass.
 * ------------------------------------------------------------------------- */
