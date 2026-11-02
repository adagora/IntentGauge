// Frozen pre-indexing implementation for differential compatibility tests.
// Source SHA-256: 58e0241725519f91a2606813692f275d88992d6f3a3f7e90e9287a35664c7142
import { isDeepStrictEqual } from 'node:util';
import { pointer } from '../../src/evaluators.js';
import type { CaseResult, CheckResult, Relation } from '../../src/types.js';

export function referenceRelationCheck(relation: Relation, source: CaseResult, target: CaseResult): CheckResult {
  const base = { id: relation.id, severity: relation.severity ?? 'normal' } as const;
  const a = pointer(source.output, relation.path), b = pointer(target.output, relation.path);
  if (a === undefined || b === undefined) return { ...base, status: 'fail', score: 0, reason: `Paired evidence missing at ${relation.path} (${relation.source} → ${relation.target})` };
  const tolerance = relation.tolerance ?? 0;
  const numeric = typeof a === 'number' && typeof b === 'number';
  let pass: boolean;
  if (relation.type === 'unchanged' || relation.type === 'changed') {
    const same = numeric ? Math.abs(a - b) <= tolerance : isDeepStrictEqual(a, b);
    pass = relation.type === 'unchanged' ? same : !same;
  } else {
    if (!numeric) return { ...base, status: 'error', reason: 'Directional relation requires numeric evidence on both cases' };
    pass = relation.type === 'nonIncreasing' ? b <= a + tolerance : b >= a - tolerance;
  }
  return { ...base, status: pass ? 'pass' : 'fail', score: Number(pass), reason: `${relation.type} at ${relation.path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}; paired with ${relation.source}, tolerance ${tolerance}` };
}
export function referenceApplyRelations(results: CaseResult[], relations: Relation[]) {
  const indexed = new Map(results.map(r => [JSON.stringify([r.caseId, r.repetition]), r]));
  for (const relation of relations) for (const target of results.filter(r => r.caseId === relation.target)) {
    const source = indexed.get(JSON.stringify([relation.source, target.repetition]));
    if (!source) throw new Error(`Missing paired case ${relation.source}, repetition ${target.repetition}`);
    const check = referenceRelationCheck(relation, source, target); target.checks.push(check);
    if (check.status === 'error') target.status = 'error';
    else if (check.status !== 'pass' && target.status !== 'error') target.status = 'fail';
  }
}
