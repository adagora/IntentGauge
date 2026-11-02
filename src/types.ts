export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Severity = 'normal' | 'critical';
export type CheckStatus = 'pass' | 'fail' | 'error' | 'skip';
export interface Document { id: string; text?: string; metadata?: Record<string, Json> }
export interface Citation { sourceId: string; quote?: string; metadata?: Record<string, Json> }
export interface ToolCall { name: string; arguments?: Json; result?: Json }
export interface Observation {
  answer?: string;
  intent?: string;
  abstained?: boolean;
  retrieved?: Document[];
  citations?: Citation[];
  toolCalls?: ToolCall[];
  cost?: number;
  tokens?: number;
  data?: Json;
}
export type AssertionType = 'equals' | 'contains' | 'notContains' | 'range' | 'intent'
  | 'abstention' | 'retrievalRecall' | 'retrievalPrecision' | 'mrr' | 'ndcg'
  | 'citations' | 'toolAllowlist' | 'toolSequence' | 'judge';
export interface Assertion {
  id: string;
  type: AssertionType;
  severity?: Severity;
  path?: string;
  value?: Json;
  min?: number;
  max?: number;
  threshold?: number;
  k?: number;
  requireQuotes?: boolean;
  rubric?: string;
}
export interface EvalCase {
  id: string;
  input: Json;
  intent: string;
  split: 'dev' | 'test' | 'holdout';
  tags?: string[];
  assertions: Assertion[];
}
export interface Gate {
  intent?: string;
  minCases?: number;
  minPassRate?: number;
  minPassRateLowerBound?: number;
  minPrecision?: number;
  minRecall?: number;
  maxCriticalFailures?: number;
  maxErrorRate?: number;
  maxP95LatencyMs?: number;
  maxMeanCost?: number;
  maxMeanMistakeCost?: number;
}
export interface Suite {
  schemaVersion: 1;
  name: string;
  version: string;
  currency?: string;
  cases: EvalCase[];
  gates?: Gate[];
  mistakeCosts?: Record<string, Record<string, number>>;
  relations?: Relation[];
}
/** Paired interventions test invariants or intended sensitivity without an LLM judge. */
export interface Relation {
  id: string;
  source: string;
  target: string;
  path: string;
  type: 'unchanged' | 'changed' | 'nonIncreasing' | 'nonDecreasing';
  tolerance?: number;
  severity?: Severity;
}
export interface TargetRequest { id: string; input: Json }
export interface ExecutionContext { signal: AbortSignal; repetition: number }
export interface Target {
  name: string;
  revision: string;
  execute(request: TargetRequest, context: ExecutionContext): Promise<Observation>;
}
export interface CheckResult {
  id: string;
  status: CheckStatus;
  severity: Severity;
  score?: number;
  reason: string;
}
export interface JudgeRequest {
  input: Json;
  output: Observation;
  rubric: string;
}
export interface JudgeVerdict { score: number; reason: string }
export interface Judge {
  name: string;
  revision: string;
  evaluate(request: JudgeRequest, context: ExecutionContext): Promise<JudgeVerdict>;
}
export interface Evaluator {
  id: string;
  revision: string;
  evaluate(testCase: EvalCase, output: Observation, context: ExecutionContext): Promise<CheckResult>;
}
export interface CaseResult {
  caseId: string;
  repetition: number;
  intent: string;
  split: EvalCase['split'];
  tags: string[];
  status: 'pass' | 'fail' | 'error';
  latencyMs: number;
  checks: CheckResult[];
  output?: Observation;
  error?: string;
}
export interface Slice {
  cases: number;
  trials: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: number;
  /** Computed over unique cases, success only if every repetition passed. */
  passRateLowerBound: number;
  criticalFailures: number;
  p95LatencyMs: number;
  meanCost: number | null;
  costCoverage: number;
}
export interface IntentMetrics { support: number; predicted: number; precision: number | null; recall: number | null }
export interface Summary {
  overall: Slice;
  byIntent: Record<string, Slice>;
  byTag: Record<string, Slice>;
  confusion: Record<string, Record<string, number>>;
  classification: Record<string, IntentMetrics>;
  byCheck: Record<string, { trials: number; passed: number; failed: number; errors: number; skipped: number; meanScore: number | null; scoreCoverage: number }>;
  mistakeCost: { total: number; mean: number | null; coverage: number };
}
export interface GateResult { scope: string; metric: string; passed: boolean; actual: number | null; expected: number }
export interface RunReport {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  suite: { name: string; version: string; hash: string; currency?: string };
  target: { name: string; revision: string };
  evaluators: { id: string; revision: string }[];
  judge?: { name: string; revision: string };
  options: { repetitions: number; concurrency: number; timeoutMs: number };
  results: CaseResult[];
  summary: Summary;
  gates: GateResult[];
  passed: boolean;
}
