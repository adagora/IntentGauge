import { createHash, randomUUID } from 'node:crypto';
import { evaluate } from './evaluators.js';
import { summarizeAndCheckGates } from './statistics.js';
import { validateObservation, validateSuite } from './validation.js';
import { applyRelations } from './relations.js';
import type { CaseResult, CheckResult, Evaluator, Judge, RunReport, Suite, Target } from './types.js';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export async function deadline<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => fn(controller.signal)), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { const error = new Error(`Timed out after ${ms} ms`); controller.abort(error); reject(error); }, ms);
    })]);
  } finally { clearTimeout(timer); }
}
export interface RunOptions { concurrency?: number; repetitions?: number; timeoutMs?: number; judge?: Judge; evaluators?: Evaluator[] }
export async function run(suite: Suite, target: Target, options: RunOptions = {}): Promise<RunReport> {
  suite = structuredClone(suite);
  validateSuite(suite);
  if (!target.name || !target.revision || typeof target.execute !== 'function') throw new Error('Target requires name, revision, execute');
  if (options.judge && (!options.judge.name || !options.judge.revision || typeof options.judge.evaluate !== 'function')) throw new Error('Judge requires name, revision, evaluate');
  const concurrency = options.concurrency ?? 4, repetitions = options.repetitions ?? 1, timeoutMs = options.timeoutMs ?? 30_000;
  for (const [key, val] of Object.entries({ concurrency, repetitions, timeoutMs })) if (!Number.isSafeInteger(val) || val < 1) throw new Error(`${key} must be a positive safe integer`);
  if (concurrency > 256 || repetitions > 1000 || timeoutMs > 2_147_483_647) throw new Error('Run options exceed limits (256 concurrency, 1000 repetitions, 2147483647ms timeout)');
  const custom = options.evaluators ?? [];
  for (const evaluator of custom) if (!evaluator.id || !evaluator.revision || typeof evaluator.evaluate !== 'function') throw new Error('Custom evaluator requires id, revision, evaluate');
  if (custom.some(e => suite.relations?.some(r => r.id === e.id))) throw new Error('Evaluator id collides with relation');
  for (const c of suite.cases) if (new Set([...c.assertions.map(a => a.id), ...custom.map(e => e.id)]).size !== c.assertions.length + custom.length) throw new Error('Evaluator ids must be unique and not collide with assertions');
  const jobs = suite.cases.flatMap(c => Array.from({ length: repetitions }, (_, repetition) => ({ c, repetition })));
  const results: CaseResult[] = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor++, { c, repetition } = jobs[index]!;
      const base = { caseId: c.id, repetition, intent: c.intent, split: c.split, tags: c.tags ?? [] };
      const start = performance.now();
      let latencyMs = 0;
      try {
        const output = validateObservation(structuredClone(await deadline(signal => target.execute({ id: c.id, input: structuredClone(c.input) }, { signal, repetition }), timeoutMs)));
        latencyMs = performance.now() - start;
        const checks: CheckResult[] = [];
        const tasks = [
          ...c.assertions.map(a => ({ id: a.id, severity: a.severity ?? 'normal' as const, exec: (signal: AbortSignal) => evaluate(a, c, output, { signal, repetition }, options.judge) })),
          ...custom.map(e => ({ id: e.id, severity: 'normal' as const, exec: (signal: AbortSignal) => e.evaluate(structuredClone(c), structuredClone(output), { signal, repetition }) })),
        ];
        for (const task of tasks) {
          try {
            const check = await deadline(task.exec, timeoutMs);
            if (!check || check.id !== task.id || !['pass', 'fail', 'error', 'skip'].includes(check.status) || !['normal', 'critical'].includes(check.severity) || typeof check.reason !== 'string' || (check.score !== undefined && (!Number.isFinite(check.score) || check.score < 0 || check.score > 1))) throw new Error('Invalid evaluator result');
            checks.push(check);
          } catch (error) { checks.push({ id: task.id, severity: task.severity, status: 'error', reason: error instanceof Error ? error.message : String(error) }); }
        }
        const status = checks.some(r => r.status === 'error') ? 'error' : checks.every(r => r.status === 'pass') ? 'pass' : 'fail';
        results[index] = { ...base, status, latencyMs, checks, output };
      } catch (error) {
        results[index] = { ...base, status: 'error', latencyMs: latencyMs || performance.now() - start, checks: c.assertions.map(a => ({ id: a.id, severity: a.severity ?? 'normal', status: 'error', reason: 'Target failed; evidence unavailable' })), error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  applyRelations(results, suite.relations ?? []);
  const { summary, gates } = summarizeAndCheckGates(results, suite);
  return {
    schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(),
    suite: { name: suite.name, version: suite.version, hash: hash(suite), ...(suite.currency ? { currency: suite.currency } : {}) },
    target: { name: target.name, revision: target.revision },
    evaluators: custom.map(e => ({ id: e.id, revision: e.revision })),
    ...(options.judge ? { judge: { name: options.judge.name, revision: options.judge.revision } } : {}),
    options: { concurrency, repetitions, timeoutMs }, results, summary, gates,
    passed: summary.overall.errors === 0 && summary.overall.criticalFailures === 0 && (gates.length ? gates.every(g => g.passed) : results.every(r => r.status === 'pass')),
  };
}
