import { isDeepStrictEqual } from 'node:util';
import type { Assertion, CheckResult, EvalCase, ExecutionContext, Judge, Observation } from './types.js';

export function pointer(value: unknown, path: string): unknown {
  return path.split('/').slice(1).reduce<unknown>((v, part) => {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    return v !== null && typeof v === 'object' && Object.hasOwn(v, key) ? (v as Record<string, unknown>)[key] : undefined;
  }, value);
}
export async function evaluate(a: Assertion, c: EvalCase, o: Observation, context: ExecutionContext, judge?: Judge): Promise<CheckResult> {
  const base = { id: a.id, severity: a.severity ?? 'normal' } as const;
  const result = (score: number, reason: string): CheckResult => ({ ...base, score, status: score >= (a.threshold ?? 1) ? 'pass' : 'fail', reason });
  const missing = (field: string): CheckResult => ({ ...base, status: 'fail', score: 0, reason: `Missing evidence: ${field}` });
  const actual = a.path ? pointer(o, a.path) : o.answer;
  switch (a.type) {
    case 'equals': return actual === undefined ? missing(a.path ?? 'answer') : result(Number(isDeepStrictEqual(actual, a.value)), 'Exact structural equality');
    case 'contains': case 'notContains': {
      if (typeof actual !== 'string') return missing(a.path ?? 'answer');
      const present = actual.includes(a.value as string);
      return result(Number(a.type === 'contains' ? present : !present), `${a.type}: ${JSON.stringify(a.value)}`);
    }
    case 'range': return typeof actual !== 'number' ? missing(a.path ?? 'answer') : result(Number(actual >= (a.min ?? -Infinity) && actual <= (a.max ?? Infinity)), `Observed ${actual}; range [${a.min ?? '-∞'}, ${a.max ?? '∞'}]`);
    case 'intent': return o.intent === undefined ? missing('intent') : result(Number(o.intent === a.value), `Expected ${a.value}; predicted ${o.intent}`);
    case 'abstention': return o.abstained === undefined ? missing('abstained') : result(Number(o.abstained === a.value), `Expected abstained=${a.value}; observed ${o.abstained}`);
    case 'retrievalRecall': case 'retrievalPrecision': case 'mrr': case 'ndcg': {
      if (!o.retrieved) return missing('retrieved');
      const relevant = new Set(a.value as string[]);
      const ranked = o.retrieved.slice(0, a.k ?? o.retrieved.length);
      const hits = ranked.map(d => Number(relevant.has(d.id)));
      const count = hits.reduce<number>((x, y) => x + y, 0);
      let score = 0;
      if (a.type === 'retrievalRecall') score = count / relevant.size;
      if (a.type === 'retrievalPrecision') score = ranked.length ? count / ranked.length : 0;
      if (a.type === 'mrr') score = hits.includes(1) ? 1 / (hits.indexOf(1) + 1) : 0;
      if (a.type === 'ndcg') {
        const dcg = hits.reduce<number>((sum, hit, i) => sum + hit / Math.log2(i + 2), 0);
        const idealLength = Math.min(relevant.size, a.k ?? Math.max(ranked.length, relevant.size));
        const ideal = Array.from({ length: idealLength }, (_, i) => 1 / Math.log2(i + 2)).reduce((x, y) => x + y, 0);
        score = ideal ? dcg / ideal : 0;
      }
      return result(score, `${count}/${relevant.size} relevant documents in ${ranked.length} retrieved results`);
    }
    case 'citations': {
      if (!o.citations?.length || !o.retrieved) return missing('nonempty citations and retrieved evidence');
      const docs = new Map(o.retrieved.map(d => [d.id, d]));
      const invalid = o.citations.filter(citation => {
        const doc = docs.get(citation.sourceId);
        return !doc || ((a.requireQuotes ?? true) && !citation.quote?.trim()) || (citation.quote !== undefined && (!doc.text || !doc.text.includes(citation.quote)));
      });
      const incomplete = invalid.some(citation => docs.get(citation.sourceId)?.metadata?.textCoverage === 'preview');
      if (incomplete) return { ...base, status: 'error', reason: 'Citation provenance cannot be established from truncated source previews. Supply full retrieved text.' };
      return result(1 - invalid.length / o.citations.length, `${invalid.length} unresolved or unsupported quotes; checks literal provenance, not semantic entailment`);
    }
    case 'toolAllowlist': {
      if (!o.toolCalls) return missing('toolCalls (use [] when no tools ran)');
      const forbidden = o.toolCalls.filter(t => !(a.value as string[]).includes(t.name));
      return result(Number(forbidden.length === 0), forbidden.length ? `Disallowed tools: ${forbidden.map(t => t.name).join(', ')}` : 'All observed tools allowed');
    }
    case 'toolSequence': {
      if (!o.toolCalls) return missing('toolCalls');
      const expected = a.value as string[];
      let position = 0;
      for (const t of o.toolCalls) if (t.name === expected[position]) position++;
      return result(Number(position === expected.length), `Required ordered subsequence: ${expected.join(' → ')}`);
    }
    case 'judge': {
      if (!judge) return { ...base, status: 'error', reason: 'Judge assertion requires a configured judge' };
      const verdict = await judge.evaluate({ input: structuredClone(c.input), output: structuredClone(o), rubric: a.rubric! }, context);
      if (!verdict || !Number.isFinite(verdict.score) || verdict.score < 0 || verdict.score > 1 || typeof verdict.reason !== 'string' || !verdict.reason.trim()) throw new Error('Judge must return {score: number in [0,1], reason: nonempty string}');
      return result(verdict.score, verdict.reason);
    }
  }
}
