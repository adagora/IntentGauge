import { isDeepStrictEqual } from 'node:util';
import { pointer } from './evaluators.js';
import type { CaseResult, CheckResult, Relation } from './types.js';

export function relationCheck(relation: Relation, source: CaseResult, target: CaseResult): CheckResult {
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
export function applyRelations(results: CaseResult[], relations: Relation[]) {
  if (!relations.length || !results.length) return;
  // Resolve arbitrary external IDs at the boundary. Group trial row indexes into
  // contiguous ranges, retaining the original target order inside every range.
  const caseSlots = new Map<string, number>(), counts: number[] = [];
  const rowSlots = new Uint32Array(results.length);
  for (let i = 0; i < results.length; i++) {
    const id = results[i]!.caseId;
    let slot = caseSlots.get(id);
    if (slot === undefined) { slot = counts.length; caseSlots.set(id, slot); counts.push(0); }
    rowSlots[i] = slot; counts[slot]!++;
  }
  const offsets = new Uint32Array(counts.length + 1);
  for (let slot = 0; slot < counts.length; slot++) offsets[slot + 1] = offsets[slot]! + counts[slot]!;
  const cursors = offsets.slice(0, -1), targetRows = new Uint32Array(results.length);
  for (let i = 0; i < results.length; i++) targetRows[cursors[rowSlots[i]!]!++] = i;
  // Source ranges are sorted by repetition, separately from target traversal.
  // Ties resolve to the last input row, matching the old compound-key Map.
  const sourceRows = targetRows.slice();
  for (let slot = 0; slot < counts.length; slot++) if (counts[slot]! > 1) {
    sourceRows.subarray(offsets[slot]!, offsets[slot + 1]!).sort((a, b) => results[a]!.repetition - results[b]!.repetition || a - b);
  }
  function sourceAt(slot: number, repetition: number): CaseResult | undefined {
    const start = offsets[slot]!, end = offsets[slot + 1]!;
    let lo = start, hi = end;
    while (lo < hi) {
      const middle = lo + Math.floor((hi - lo) / 2);
      if (results[sourceRows[middle]!]!.repetition <= repetition) lo = middle + 1;
      else hi = middle;
    }
    const row = lo > start ? results[sourceRows[lo - 1]!] : undefined;
    return row?.repetition === repetition ? row : undefined;
  }
  for (const relation of relations) {
    const targetSlot = caseSlots.get(relation.target);
    if (targetSlot === undefined) continue;
    const sourceSlot = caseSlots.get(relation.source);
    for (let i = offsets[targetSlot]!; i < offsets[targetSlot + 1]!; i++) {
      const target = results[targetRows[i]!]!;
      const source = sourceSlot === undefined ? undefined : sourceAt(sourceSlot, target.repetition);
      if (!source) throw new Error(`Missing paired case ${relation.source}, repetition ${target.repetition}`);
      const check = relationCheck(relation, source, target); target.checks.push(check);
      if (check.status === 'error') target.status = 'error';
      else if (check.status !== 'pass' && target.status !== 'error') target.status = 'fail';
    }
  }
}
