// Frozen pre-rewrite implementation for differential compatibility testing.
// Source SHA-256: ec6809cf3759cf56dfbf13058be0904e37fb3299956713152569608a111bb8ac
import { number, object, string } from '../../src/validation.js';

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
export function referenceAgreement(a: boolean[], b: boolean[]) {
  const n = a.length;
  if (!n || n !== b.length) return { agreement: null, kappa: null };
  const observed = a.filter((v, i) => v === b[i]).length / n;
  const pa = a.filter(Boolean).length / n, pb = b.filter(Boolean).length / n;
  const expected = pa * pb + (1 - pa) * (1 - pb);
  return { agreement: observed, kappa: expected === 1 ? null : (observed - expected) / (1 - expected) };
}
export function referenceCalibrate(input: unknown, minCases = 30, minAgreement = .8) {
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
  const groups = new Map<string, CalibrationRow[]>();
  for (const row of rows) { const key = JSON.stringify([row.intent, row.rubric]); groups.set(key, [...(groups.get(key) ?? []), row]); }
  const slices = [...groups.values()].map(group => {
    const human = referenceAgreement(group.map(r => r.humans[0].value), group.map(r => r.humans[1].value));
    const resolved = group.flatMap(r => {
      const gold = r.humans[0].value === r.humans[1].value ? r.humans[0].value : r.adjudication?.value;
      return gold === undefined ? [] : [{ caseId: r.caseId, gold, judge: r.judge }];
    });
    const judge = referenceAgreement(resolved.map(r => r.gold), resolved.map(r => r.judge));
    const positives = resolved.filter(r => r.gold).length, negatives = resolved.length - positives;
    return {
      intent: group[0]!.intent, rubric: group[0]!.rubric, cases: group.length,
      unresolved: group.length - resolved.length, human, judge,
      classSupport: { positive: positives, negative: negatives },
      falsePositives: resolved.filter(r => !r.gold && r.judge).length,
      falseNegatives: resolved.filter(r => r.gold && !r.judge).length,
      eligible: positives > 0 && negatives > 0 && resolved.length === group.length && group.length >= minCases && judge.agreement !== null && judge.agreement >= Math.max(minAgreement, human.agreement ?? 1),
      resolved,
    };
  });
  return { judge: input.judge, datasetVersion: input.datasetVersion, minCases, minAgreement, eligible: slices.every(s => s.eligible), slices };
}
