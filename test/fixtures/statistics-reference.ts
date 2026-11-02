// Frozen pre-aggregation implementation for differential compatibility testing.
// Source SHA-256: f9ba79ab9dea910773ba8a3bc75dcc6c98c3b299638ac0ae8338a2fc95973d5b
import type { CaseResult, GateResult, Slice, Suite, Summary } from '../../src/types.js';

export function referenceWilsonLower(successes: number, count: number): number {
  if (!count) return 0;
  const z = 1.959963984540054, p = successes / count, z2 = z * z;
  return Math.max(0, (p + z2 / (2 * count) - z * Math.sqrt((p * (1 - p) + z2 / (4 * count)) / count)) / (1 + z2 / count));
}
export function referenceSlice(results: CaseResult[]): Slice {
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) groups.set(r.caseId, [...(groups.get(r.caseId) ?? []), r]);
  const passed = results.filter(r => r.status === 'pass').length;
  const costs = results.flatMap(r => r.output?.cost === undefined ? [] : [r.output.cost]);
  const times = results.map(r => r.latencyMs).sort((a, b) => a - b);
  return {
    cases: groups.size, trials: results.length, passed,
    failed: results.filter(r => r.status === 'fail').length,
    errors: results.filter(r => r.status === 'error').length,
    passRate: results.length ? passed / results.length : 0,
    passRateLowerBound: referenceWilsonLower([...groups.values()].filter(g => g.every(r => r.status === 'pass')).length, groups.size),
    criticalFailures: results.reduce((sum, r) => sum + r.checks.filter(c => c.severity === 'critical' && c.status !== 'pass').length, 0),
    p95LatencyMs: times[Math.max(0, Math.ceil(times.length * .95) - 1)] ?? 0,
    meanCost: costs.length === results.length && costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    costCoverage: results.length ? costs.length / results.length : 0,
  };
}
export function referenceMistakeCost(results: CaseResult[], suite: Suite): Summary['mistakeCost'] {
  let total = 0, known = 0;
  for (const r of results) {
    const predicted = r.output?.intent ?? (r.status === 'error' ? '__error__' : '__missing__');
    const matrix = suite.mistakeCosts;
    const row = matrix && Object.hasOwn(matrix, r.intent) ? matrix[r.intent] : undefined;
    const cost = predicted === r.intent ? 0 : row && Object.hasOwn(row, predicted) ? row[predicted] : undefined;
    if (cost !== undefined) { known++; total += cost; }
  }
  return { total, mean: known === results.length && known ? total / known : null, coverage: results.length ? known / results.length : 0 };
}
export function referenceSummarize(results: CaseResult[], suite: Suite): Summary {
  const intents = [...new Set(results.map(r => r.intent))];
  const tags = [...new Set(results.flatMap(r => r.tags))];
  const confusion: Summary['confusion'] = Object.create(null);
  for (const r of results) {
    const predicted = r.output?.intent ?? (r.status === 'error' ? '__error__' : '__missing__');
    confusion[r.intent] ??= Object.create(null);
    confusion[r.intent]![predicted] = (confusion[r.intent]![predicted] ?? 0) + 1;
  }
  const labels = [...new Set([...intents, ...Object.values(confusion).flatMap(Object.keys)])];
  const checkIds = [...new Set(results.flatMap(r => r.checks.map(c => c.id)))];
  const byCheck = Object.fromEntries(checkIds.map(id => {
    const checks = results.flatMap(r => r.checks.filter(c => c.id === id));
    const scores = checks.flatMap(c => c.score === undefined ? [] : [c.score]);
    return [id, { trials: checks.length, passed: checks.filter(c => c.status === 'pass').length, failed: checks.filter(c => c.status === 'fail').length, errors: checks.filter(c => c.status === 'error').length, skipped: checks.filter(c => c.status === 'skip').length, meanScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, scoreCoverage: scores.length / checks.length }];
  }));
  const classification = Object.fromEntries(labels.map(label => {
    const correct = confusion[label]?.[label] ?? 0;
    const support = Object.values(confusion[label] ?? {}).reduce((a, b) => a + b, 0);
    const predicted = Object.values(confusion).reduce((a, row) => a + (row[label] ?? 0), 0);
    return [label, { support, predicted, precision: predicted ? correct / predicted : null, recall: support ? correct / support : null }];
  }));
  return {
    overall: referenceSlice(results),
    byIntent: Object.fromEntries(intents.map(i => [i, referenceSlice(results.filter(r => r.intent === i))])),
    byTag: Object.fromEntries(tags.map(t => [t, referenceSlice(results.filter(r => r.tags.includes(t)))])),
    confusion, classification, byCheck, mistakeCost: referenceMistakeCost(results, suite),
  };
}
export function referenceCheckGates(summary: Summary, results: CaseResult[], suite: Suite): GateResult[] {
  const gates: GateResult[] = [];
  for (const gate of suite.gates ?? []) {
    const scope = gate.intent ?? 'overall';
    const selected = gate.intent === undefined ? results : results.filter(r => r.intent === gate.intent);
    const s = referenceSlice(selected);
    for (const [key, expected] of Object.entries(gate)) {
      if (key === 'intent') continue;
      const values: Record<string, number | null> = {
        minCases: s.cases, minPassRate: s.passRate, minPassRateLowerBound: s.passRateLowerBound,
        minPrecision: summary.classification[scope]?.precision ?? null,
        minRecall: summary.classification[scope]?.recall ?? null,
        maxCriticalFailures: s.criticalFailures, maxErrorRate: s.trials ? s.errors / s.trials : null,
        maxP95LatencyMs: s.p95LatencyMs, maxMeanCost: s.meanCost,
        maxMeanMistakeCost: referenceMistakeCost(selected, suite).mean,
      };
      const actual = values[key] ?? null;
      gates.push({ scope, metric: key, expected: expected as number, actual, passed: s.trials > 0 && actual !== null && (key.startsWith('min') ? actual >= (expected as number) : actual <= (expected as number)) });
    }
  }
  return gates;
}
