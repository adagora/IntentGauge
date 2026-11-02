import { number, object, string } from './validation.js';

export interface Label { reviewer: string; value: boolean }
export interface CalibrationRow {
  caseId: string;
  intent: string;
  rubric: string;
  split: 'holdout';
  humans: [Label, Label];
  adjudication?: Label;
  judge: boolean;
}
export function agreement(a: boolean[], b: boolean[]) {
  const n = a.length;
  if (!n || n !== b.length) return { agreement: null, kappa: null };
  const observed = a.filter((v, i) => v === b[i]).length / n;
  const pa = a.filter(Boolean).length / n, pb = b.filter(Boolean).length / n;
  const expected = pa * pb + (1 - pa) * (1 - pb);
  return { agreement: observed, kappa: expected === 1 ? null : (observed - expected) / (1 - expected) };
}
export function calibrate(input: unknown, minCases = 30, minAgreement = .8) {
  number(minCases, 'minCases', 1); number(minAgreement, 'minAgreement', 0, 1);
  if (!Number.isInteger(minCases)) throw new Error('minCases must be integer');
  object(input, 'calibration dataset'); object(input.judge, 'calibration judge');
  string(input.judge.name, 'judge.name'); string(input.judge.revision, 'judge.revision'); string(input.datasetVersion, 'datasetVersion');
  if (input.schemaVersion !== 1) throw new Error('calibration schemaVersion must be 1');
  const inputRows = input.rows;
  if (!Array.isArray(inputRows) || !inputRows.length) throw new Error('Calibration requires nonempty label rows');
  const seen = new Set();
  for (const row of inputRows) {
    object(row, 'label row');
    for (const key of ['caseId', 'intent', 'rubric']) string(row[key], key);
    if (row.split !== 'holdout') throw new Error('Judge calibration requires held-out labels');
    const key = JSON.stringify([row.caseId, row.rubric]);
    if (seen.has(key)) throw new Error(`Duplicate calibration label: ${key}`); seen.add(key);
    if (!Array.isArray(row.humans) || row.humans.length !== 2) throw new Error('Two independent human labels required');
    for (const label of [...row.humans, ...(row.adjudication ? [row.adjudication] : [])]) {
      object(label, 'label'); string(label.reviewer, 'reviewer');
      if (typeof label.value !== 'boolean') throw new Error('Label value must be boolean');
    }
    if (row.humans[0].reviewer === row.humans[1].reviewer) throw new Error('Human reviewers must differ');
    if (row.adjudication && row.humans.some(h => h.reviewer === (row.adjudication as Label).reviewer)) throw new Error('Adjudicator must be a third reviewer');
    if (typeof row.judge !== 'boolean') throw new Error('judge label must be boolean');
  }
  const rows = inputRows as CalibrationRow[];
  // Resolve external keys once per row. Numeric counters live in one flat buffer;
  // only the evidence returned to callers needs a per-group variable-length list.
  const N = 0, A_POS = 1, B_POS = 2, HUMAN_MATCH = 3, RESOLVED = 4,
    GOLD_POS = 5, JUDGE_POS = 6, JUDGE_MATCH = 7, FALSE_POS = 8, FALSE_NEG = 9, STRIDE = 10;
  const groupSlots = new Map<string, number>(), counts: number[] = [];
  const groups: { intent: string; rubric: string; resolved: { caseId: string; gold: boolean; judge: boolean }[] }[] = [];
  for (const row of rows) {
    const key = JSON.stringify([row.intent, row.rubric]);
    let slot = groupSlots.get(key);
    if (slot === undefined) {
      slot = groups.length; groupSlots.set(key, slot);
      groups.push({ intent: row.intent, rubric: row.rubric, resolved: [] });
      for (let i = 0; i < STRIDE; i++) counts.push(0);
    }
    const base = slot * STRIDE, a = row.humans[0].value, b = row.humans[1].value;
    counts[base + N]!++; counts[base + A_POS]! += Number(a); counts[base + B_POS]! += Number(b);
    counts[base + HUMAN_MATCH]! += Number(a === b);
    const gold = a === b ? a : row.adjudication?.value;
    if (gold !== undefined) {
      counts[base + RESOLVED]!++; counts[base + GOLD_POS]! += Number(gold);
      counts[base + JUDGE_POS]! += Number(row.judge); counts[base + JUDGE_MATCH]! += Number(gold === row.judge);
      counts[base + FALSE_POS]! += Number(!gold && row.judge); counts[base + FALSE_NEG]! += Number(gold && !row.judge);
      groups[slot]!.resolved.push({ caseId: row.caseId, gold, judge: row.judge });
    }
  }
  // Keep this helper local: calibrate is also embedded directly in offline dashboards.
  function fromCounts(n: number, matches: number, aPositive: number, bPositive: number) {
    if (!n) return { agreement: null, kappa: null };
    const observed = matches / n, pa = aPositive / n, pb = bPositive / n;
    const expected = pa * pb + (1 - pa) * (1 - pb);
    return { agreement: observed, kappa: expected === 1 ? null : (observed - expected) / (1 - expected) };
  }
  const slices = groups.map((group, slot) => {
    const base = slot * STRIDE, cases = counts[base + N]!, resolvedCount = counts[base + RESOLVED]!;
    const human = fromCounts(cases, counts[base + HUMAN_MATCH]!, counts[base + A_POS]!, counts[base + B_POS]!);
    const judge = fromCounts(resolvedCount, counts[base + JUDGE_MATCH]!, counts[base + GOLD_POS]!, counts[base + JUDGE_POS]!);
    const positives = counts[base + GOLD_POS]!, negatives = resolvedCount - positives;
    return {
      intent: group.intent, rubric: group.rubric, cases,
      unresolved: cases - resolvedCount, human, judge,
      classSupport: { positive: positives, negative: negatives },
      falsePositives: counts[base + FALSE_POS]!, falseNegatives: counts[base + FALSE_NEG]!,
      eligible: positives > 0 && negatives > 0 && resolvedCount === cases && cases >= minCases && judge.agreement !== null && judge.agreement >= Math.max(minAgreement, human.agreement ?? 1),
      resolved: group.resolved,
    };
  });
  return { judge: input.judge, datasetVersion: input.datasetVersion, minCases, minAgreement, eligible: slices.every(s => s.eligible), slices };
}
