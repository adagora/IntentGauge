import type { CaseResult, Gate, GateResult, Slice, Suite, Summary } from './types.js';

export function wilsonLower(successes: number, count: number): number {
  if (!count) return 0;
  const z = 1.959963984540054, p = successes / count, z2 = z * z;
  return Math.max(0, (p + z2 / (2 * count) - z * Math.sqrt((p * (1 - p) + z2 / (4 * count)) / count)) / (1 + z2 / count));
}

const TRIALS = 0, PASSED = 1, FAILED = 2, ERRORS = 3, CRITICAL = 4,
  COST_COUNT = 5, COST_SUM = 6, CASES = 7, FAILED_CASES = 8,
  MISTAKE_COUNT = 9, MISTAKE_SUM = 10, SLICE_WIDTH = 11;

/** Numeric slices plus sparse trial/slice memberships. Nothing survives the analysis call. */
class SliceTable {
  readonly counts: number[] = [];
  private readonly times: number[][] = [];
  private readonly caseSlots = new Map<string, number>();
  private readonly caseHeads: number[] = [];
  private readonly nextTrial: Uint32Array;
  private readonly membershipOffsets: Uint32Array;
  private readonly membershipSlices: number[] = [];
  constructor(private readonly results: CaseResult[]) {
    this.nextTrial = new Uint32Array(results.length);
    this.membershipOffsets = new Uint32Array(results.length + 1);
  }
  create(): number {
    const slot = this.times.length;
    this.times.push([]);
    for (let i = 0; i < SLICE_WIDTH; i++) this.counts.push(0);
    return slot;
  }
  start(index: number, row: CaseResult) {
    if (this.results.length < 2) return;
    let caseSlot = this.caseSlots.get(row.caseId);
    if (caseSlot === undefined) { caseSlot = this.caseHeads.length; this.caseSlots.set(row.caseId, caseSlot); this.caseHeads.push(0); }
    this.nextTrial[index] = this.caseHeads[caseSlot]!;
    this.caseHeads[caseSlot] = index + 1;
  }
  add(slot: number, row: CaseResult, critical: number, mistake: number | undefined) {
    const base = slot * SLICE_WIDTH, c = this.counts;
    c[base + TRIALS]!++;
    if (row.status === 'pass') c[base + PASSED]!++;
    else if (row.status === 'fail') c[base + FAILED]!++;
    else if (row.status === 'error') c[base + ERRORS]!++;
    c[base + CRITICAL]! += critical;
    if (row.output?.cost !== undefined) { c[base + COST_COUNT]!++; c[base + COST_SUM]! += row.output.cost; }
    if (mistake !== undefined) { c[base + MISTAKE_COUNT]!++; c[base + MISTAKE_SUM]! += mistake; }
    this.times[slot]!.push(row.latencyMs);
    this.membershipSlices.push(slot);
  }
  end(index: number) { this.membershipOffsets[index + 1] = this.membershipSlices.length; }
  finish(): Slice[] {
    // Reuse two small bitsets while traversing each unique case's trials. This
    // counts support per slice without a dense case × slice matrix or bool lists.
    if (this.results.length < 2) {
      // Empty and single-row slices have no repetitions to reconcile.
      for (let slot = 0; slot < this.times.length; slot++) {
        const base = slot * SLICE_WIDTH;
        if (this.counts[base + TRIALS]) {
          this.counts[base + CASES] = 1;
          this.counts[base + FAILED_CASES] = this.counts[base + PASSED] ? 0 : 1;
        }
      }
    } else {
      const seen = new Uint32Array(Math.ceil(this.times.length / 32)), failed = new Uint32Array(seen.length), touched: number[] = [];
      for (const head of this.caseHeads) {
        for (let cursor = head; cursor; cursor = this.nextTrial[cursor - 1]!) {
          const index = cursor - 1, nonPassing = this.results[index]!.status !== 'pass';
          for (let i = this.membershipOffsets[index]!; i < this.membershipOffsets[index + 1]!; i++) {
            const slot = this.membershipSlices[i]!, word = Math.floor(slot / 32), mask = 1 << (slot % 32), base = slot * SLICE_WIDTH;
            if ((seen[word]! & mask) === 0) {
              if (!seen[word]) touched.push(word);
              seen[word]! |= mask; this.counts[base + CASES]!++;
            }
            if (nonPassing && (failed[word]! & mask) === 0) { failed[word]! |= mask; this.counts[base + FAILED_CASES]!++; }
          }
        }
        for (const word of touched) { seen[word] = 0; failed[word] = 0; }
        touched.length = 0;
      }
    }
    return this.times.map((times, slot) => {
      const base = slot * SLICE_WIDTH, c = this.counts, trials = c[base + TRIALS]!, passed = c[base + PASSED]!, cases = c[base + CASES]!, costs = c[base + COST_COUNT]!;
      times.sort((a, b) => a - b);
      return {
        cases, trials, passed, failed: c[base + FAILED]!, errors: c[base + ERRORS]!,
        passRate: trials ? passed / trials : 0,
        passRateLowerBound: wilsonLower(cases - c[base + FAILED_CASES]!, cases),
        criticalFailures: c[base + CRITICAL]!,
        p95LatencyMs: times[Math.max(0, Math.ceil(times.length * .95) - 1)] ?? 0,
        meanCost: costs === trials && costs ? c[base + COST_SUM]! / costs : null,
        costCoverage: trials ? costs / trials : 0,
      };
    });
  }
  mistake(slot: number): Summary['mistakeCost'] {
    const base = slot * SLICE_WIDTH, trials = this.counts[base + TRIALS]!, known = this.counts[base + MISTAKE_COUNT]!, total = this.counts[base + MISTAKE_SUM]!;
    return { total, mean: known === trials && known ? total / known : null, coverage: trials ? known / trials : 0 };
  }
}

function criticalFailures(row: CaseResult): number {
  let count = 0;
  for (const check of row.checks) if (check.severity === 'critical' && check.status !== 'pass') count++;
  return count;
}
function predictedIntent(row: CaseResult): string { return row.output?.intent ?? (row.status === 'error' ? '__error__' : '__missing__'); }
function pricedMistake(row: CaseResult, suite: Suite, predicted = predictedIntent(row)): number | undefined {
  const matrix = suite.mistakeCosts;
  const costs = matrix && Object.hasOwn(matrix, row.intent) ? matrix[row.intent] : undefined;
  return predicted === row.intent ? 0 : costs && Object.hasOwn(costs, predicted) ? costs[predicted] : undefined;
}
function singleSlice(row?: CaseResult): Slice {
  const trials = row ? 1 : 0, passed = Number(row?.status === 'pass'), known = row?.output?.cost !== undefined;
  return {
    cases: trials, trials, passed, failed: Number(row?.status === 'fail'), errors: Number(row?.status === 'error'),
    passRate: passed, passRateLowerBound: wilsonLower(passed, trials),
    criticalFailures: row ? criticalFailures(row) : 0, p95LatencyMs: row?.latencyMs ?? 0,
    meanCost: known ? 0 + row!.output!.cost! : null, costCoverage: Number(known),
  };
}
export function slice(results: CaseResult[]): Slice {
  if (results.length < 2) return singleSlice(results[0]);
  const table = new SliceTable(results), slot = table.create();
  for (let i = 0; i < results.length; i++) { const row = results[i]!; table.start(i, row); table.add(slot, row, criticalFailures(row), undefined); table.end(i); }
  return table.finish()[slot]!;
}
export function mistakeCost(results: CaseResult[], suite: Suite): Summary['mistakeCost'] {
  let total = 0, known = 0;
  for (const row of results) { const cost = pricedMistake(row, suite); if (cost !== undefined) { known++; total += cost; } }
  return { total, mean: known === results.length && known ? total / known : null, coverage: results.length ? known / results.length : 0 };
}

function collectSummary(results: CaseResult[], suite: Suite) {
  const table = new SliceTable(results), overall = table.create();
  const intents = new Map<string, number>(), tags = new Map<string, number>(), tagLastRow: number[] = [];
  const confusion: Summary['confusion'] = Object.create(null), predictedCounts = new Map<string, number>();
  const checkSlots = new Map<string, number>(), checkCounts: number[] = [], CHECK_WIDTH = 7;
  function slotFor(name: string, slots: Map<string, number>) {
    let slot = slots.get(name);
    if (slot === undefined) { slot = table.create(); slots.set(name, slot); }
    return slot;
  }
  for (let i = 0; i < results.length; i++) {
    const row = results[i]!, predicted = predictedIntent(row), price = pricedMistake(row, suite, predicted);
    let critical = 0;
    for (const check of row.checks) {
      if (check.severity === 'critical' && check.status !== 'pass') critical++;
      let slot = checkSlots.get(check.id);
      if (slot === undefined) { slot = checkSlots.size; checkSlots.set(check.id, slot); for (let j = 0; j < CHECK_WIDTH; j++) checkCounts.push(0); }
      const base = slot * CHECK_WIDTH;
      checkCounts[base]!++;
      const statusOffset = check.status === 'pass' ? 1 : check.status === 'fail' ? 2 : check.status === 'error' ? 3 : 4;
      checkCounts[base + statusOffset]!++;
      if (check.score !== undefined) { checkCounts[base + 5]!++; checkCounts[base + 6]! += check.score; }
    }
    table.start(i, row);
    table.add(overall, row, critical, price); table.add(slotFor(row.intent, intents), row, critical, price);
    for (const tag of row.tags) {
      const slot = slotFor(tag, tags);
      if (tagLastRow[slot] === i) continue; // Includes each trial only once even on imported duplicate tags.
      tagLastRow[slot] = i; table.add(slot, row, critical, price);
    }
    table.end(i);
    const actual = confusion[row.intent] ??= Object.create(null);
    actual[predicted] = (actual[predicted] ?? 0) + 1;
    predictedCounts.set(predicted, (predictedCounts.get(predicted) ?? 0) + 1);
  }
  const slices = table.finish();
  // Preserve the original label/property ordering, including numeric external names.
  const labels = [...new Set([...intents.keys(), ...Object.values(confusion).flatMap(Object.keys)])];
  const classification = Object.fromEntries(labels.map(label => {
    const slot = intents.get(label), support = slot === undefined ? 0 : slices[slot]!.trials;
    const predicted = predictedCounts.get(label) ?? 0, correct = confusion[label]?.[label] ?? 0;
    return [label, { support, predicted, precision: predicted ? correct / predicted : null, recall: support ? correct / support : null }];
  }));
  const byCheck = Object.fromEntries([...checkSlots].map(([id, slot]) => {
    const base = slot * CHECK_WIDTH, n = checkCounts[base]!, scored = checkCounts[base + 5]!;
    return [id, { trials: n, passed: checkCounts[base + 1]!, failed: checkCounts[base + 2]!, errors: checkCounts[base + 3]!, skipped: checkCounts[base + 4]!, meanScore: scored ? checkCounts[base + 6]! / scored : null, scoreCoverage: scored / n }];
  }));
  const summary: Summary = { overall: slices[overall]!, byIntent: Object.fromEntries([...intents].map(([name, slot]) => [name, slices[slot]!])),
    byTag: Object.fromEntries([...tags].map(([name, slot]) => [name, slices[slot]!])), confusion, classification, byCheck, mistakeCost: table.mistake(overall) };
  return { summary, table, slices, intents, overall };
}
export function summarize(results: CaseResult[], suite: Suite): Summary { return collectSummary(results, suite).summary; }

function appendGate(gates: GateResult[], summary: Summary, gate: Gate, s: Slice, mistakeMean: number | null) {
  const scope = gate.intent ?? 'overall';
  const values: Record<string, number | null> = {
    minCases: s.cases, minPassRate: s.passRate, minPassRateLowerBound: s.passRateLowerBound,
    minPrecision: summary.classification[scope]?.precision ?? null, minRecall: summary.classification[scope]?.recall ?? null,
    maxCriticalFailures: s.criticalFailures, maxErrorRate: s.trials ? s.errors / s.trials : null,
    maxP95LatencyMs: s.p95LatencyMs, maxMeanCost: s.meanCost, maxMeanMistakeCost: mistakeMean,
  };
  for (const [key, expected] of Object.entries(gate)) {
    if (key === 'intent') continue;
    const actual = values[key] ?? null;
    gates.push({ scope, metric: key, expected: expected as number, actual, passed: s.trials > 0 && actual !== null && (key.startsWith('min') ? actual >= (expected as number) : actual <= (expected as number)) });
  }
}
function renderGates(summary: Summary, suite: Suite, table: SliceTable, slices: Slice[], intents: Map<string, number>, overall: number | undefined): GateResult[] {
  const gates: GateResult[] = [], empty = singleSlice();
  for (const gate of suite.gates ?? []) {
    const slot = gate.intent === undefined ? overall : intents.get(gate.intent);
    appendGate(gates, summary, gate, slot === undefined ? empty : slices[slot]!, slot === undefined ? null : table.mistake(slot).mean);
  }
  return gates;
}

/** Analyze a current batch once, then evaluate its gates from the same accumulators. */
export function summarizeAndCheckGates(results: CaseResult[], suite: Suite): { summary: Summary; gates: GateResult[] } {
  const { summary, table, slices, intents, overall } = collectSummary(results, suite);
  return { summary, gates: renderGates(summary, suite, table, slices, intents, overall) };
}

/** Standalone calls still use the supplied current rows; no stale-summary memoization. */
export function checkGates(summary: Summary, results: CaseResult[], suite: Suite): GateResult[] {
  if (!suite.gates?.length) return [];
  if (results.length < 2) {
    const row = results[0], selected = singleSlice(row), empty = singleSlice(), price = row ? pricedMistake(row, suite) : undefined;
    const mean = price === undefined ? null : 0 + price, gates: GateResult[] = [];
    for (const gate of suite.gates) {
      const matches = row && (gate.intent === undefined || gate.intent === row.intent);
      appendGate(gates, summary, gate, matches ? selected : empty, matches ? mean : null);
    }
    return gates;
  }
  const table = new SliceTable(results), intents = new Map<string, number>();
  let overall: number | undefined;
  for (const gate of suite.gates) {
    if (gate.intent === undefined) { if (overall === undefined) overall = table.create(); }
    else if (!intents.has(gate.intent)) intents.set(gate.intent, table.create());
  }
  for (let i = 0; i < results.length; i++) {
    const row = results[i]!, slot = intents.get(row.intent);
    if (overall !== undefined || slot !== undefined) {
      const critical = criticalFailures(row), price = pricedMistake(row, suite);
      table.start(i, row);
      if (overall !== undefined) table.add(overall, row, critical, price);
      if (slot !== undefined) table.add(slot, row, critical, price);
    }
    table.end(i);
  }
  return renderGates(summary, suite, table, table.finish(), intents, overall);
}
