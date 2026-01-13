/**
 * SDLAF Verifiable Completion Contract (VCC) v1 — Adapter Interfaces (TypeScript)
 *
 * The orchestrator kernel remains domain-agnostic by depending only on:
 *  - VCCSpec (artifact DAG + acceptance criteria + gates)
 *  - Tasks that explicitly declare what they satisfy (artifacts / ACs / gates)
 *  - Adapters for planning/execution/validation/packaging/delivery
 *
 * Domain specificity lives in adapters, not the kernel.
 */

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

// --------------------- Execution context ---------------------

export interface RunContext {
  runId: string;
  workspaceRoot: string;
  team: AgentHandle[];
  state: Record<string, unknown>;
  artifacts: ArtifactStore;
  log: Logger;
}

export interface AgentHandle {
  agentId: string;
  role: RoleRef;
  displayName?: string;
  model?: string;
  tools?: string[];
}

export interface ArtifactStore {
  exists(uri: string): Promise<boolean>;
  writeText(uri: string, contents: string): Promise<void>;
  readText(uri: string): Promise<string>;
  writeBytes(uri: string, data: Uint8Array): Promise<void>;
  hash(uri: string, alg: "sha256"): Promise<string>;
  list(prefixUri: string): Promise<string[]>;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// --------------------- Adapters ---------------------

export interface PlannerAdapter {
  id: string;
  canPlan(spec: VCCSpec, ctx: RunContext): Promise<boolean>;
  plan(spec: VCCSpec, ctx: RunContext): Promise<TaskGraph>;
}

export interface ExecutorAdapter {
  id: string;
  canExecute(task: Task, ctx: RunContext): Promise<boolean>;
  execute(task: Task, ctx: RunContext): Promise<TaskResult>;
}

export interface ValidatorAdapter {
  id: string;
  supportedTypes: AcceptanceCriterionSpec["type"][];
  canValidate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<boolean>;
  validate(ac: AcceptanceCriterionSpec, spec: VCCSpec, ctx: RunContext): Promise<ValidationResult>;
}

export interface PackagerAdapter {
  id: string;
  supportedFormats: string[];
  canPackage(pkg: PackagingSpec, spec: VCCSpec, ctx: RunContext): Promise<boolean>;
  package(pkg: PackagingSpec, spec: VCCSpec, ctx: RunContext): Promise<PackageResult>;
}

export interface DelivererAdapter {
  id: string;
  supportedChannels: string[];
  canDeliver(delivery: DeliverySpec, spec: VCCSpec, ctx: RunContext): Promise<boolean>;
  deliver(delivery: DeliverySpec, spec: VCCSpec, ctx: RunContext): Promise<DeliveryResult>;
}

// --------------------- Tasks ---------------------

export interface TaskGraph {
  tasks: Task[];
  edges: Array<{ from: string; to: string }>;
}

export interface Task {
  taskId: string;
  type: string;
  title: string;
  satisfies?: { artifacts?: ArtifactId[]; acceptanceCriteria?: string[]; gates?: string[] };
  inputs?: Array<{ artifactId?: ArtifactId; uri?: string }>;
  outputs?: Array<{ artifactId?: ArtifactId; uri?: string }>;
  assignedRole?: RoleRef;
  parameters?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  status: "success" | "failed" | "skipped";
  notes?: string;
  producedArtifacts?: Array<{ artifactId: ArtifactId; uri: string; digests?: Record<string, string> }>;
  evidenceArtifacts?: Array<{ id: string; uri: string; digests?: Record<string, string> }>;
  metrics?: Record<string, number>;
}

export interface ValidationResult {
  acId: string;
  status: "pass" | "fail" | "skip";
  severity: Severity;
  summary: string;
  details?: Record<string, unknown>;
  evidence?: { evidenceType: EvidenceType; uri?: string; digests?: Record<string, string> };
}

export interface PackageResult {
  packageId: string;
  status: "success" | "failed";
  uri?: string;
  manifestUri?: string;
  digests?: Record<string, string>;
  notes?: string;
}

export interface DeliveryResult {
  deliveryId: string;
  status: "success" | "failed";
  uri?: string;
  notes?: string;
}
