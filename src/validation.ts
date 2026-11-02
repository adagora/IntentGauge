import type { Assertion, Json, Observation, Suite } from './types.js';

export function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected object`);
}
export function string(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: expected nonempty string`);
}
export function number(value: unknown, label: string, min = 0, max = Infinity): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: expected finite number in [${min}, ${max}]`);
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}: unknown field ${key}`);
}
export function json(value: unknown, label: string): asserts value is Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach((v, i) => json(v, `${label}[${i}]`)); return; }
  object(value, label);
  for (const [k, v] of Object.entries(value)) json(v, `${label}.${k}`);
}
function strings(value: unknown, label: string, unique = true): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${label}: expected string array`);
  value.forEach(v => string(v, label));
  if (unique && new Set(value).size !== value.length) throw new Error(`${label}: duplicate values`);
}
const types = ['equals', 'contains', 'notContains', 'range', 'intent', 'abstention', 'retrievalRecall', 'retrievalPrecision', 'mrr', 'ndcg', 'citations', 'toolAllowlist', 'toolSequence', 'judge'];
export function validateAssertion(value: unknown): asserts value is Assertion {
  object(value, 'assertion');
  keys(value, ['id', 'type', 'severity', 'path', 'value', 'min', 'max', 'threshold', 'k', 'requireQuotes', 'rubric'], 'assertion');
  string(value.id, 'assertion.id');
  if (!types.includes(String(value.type))) throw new Error(`Unknown assertion type: ${value.type}`);
  if (value.severity !== undefined && !['normal', 'critical'].includes(String(value.severity))) throw new Error('Invalid severity');
  if (value.path !== undefined) {
    string(value.path, 'assertion.path');
    if (!value.path.startsWith('/')) throw new Error('assertion.path must be a JSON pointer, e.g. /data/price');
  }
  if (value.threshold !== undefined) number(value.threshold, 'threshold', 0, 1);
  if (value.k !== undefined) { number(value.k, 'k', 1); if (!Number.isInteger(value.k)) throw new Error('k must be integer'); }
  if (['retrievalRecall', 'retrievalPrecision', 'mrr', 'ndcg', 'toolAllowlist', 'toolSequence'].includes(String(value.type))) strings(value.value, 'assertion.value', value.type !== 'toolSequence');
  if (['retrievalRecall', 'retrievalPrecision', 'mrr', 'ndcg'].includes(String(value.type)) && (value.value as string[]).length === 0) throw new Error('Retrieval assertions require nonempty relevance labels');
  if (['contains', 'notContains', 'intent'].includes(String(value.type))) string(value.value, 'assertion.value');
  if (value.type === 'equals') { if (!Object.hasOwn(value, 'value')) throw new Error('equals requires value'); json(value.value, 'assertion.value'); }
  if (value.type === 'abstention' && typeof value.value !== 'boolean') throw new Error('abstention requires boolean value');
  if (value.type === 'range') {
    if (value.min === undefined && value.max === undefined) throw new Error('range requires min or max');
    if (value.min !== undefined) number(value.min, 'min', -Infinity);
    if (value.max !== undefined) number(value.max, 'max', -Infinity);
    if (value.min !== undefined && value.max !== undefined && (value.min as number) > (value.max as number)) throw new Error('min exceeds max');
  }
  if (value.requireQuotes !== undefined && typeof value.requireQuotes !== 'boolean') throw new Error('requireQuotes must be boolean');
  if (value.type === 'judge') string(value.rubric, 'rubric');
}
export function validateSuite(value: unknown): Suite {
  object(value, 'suite');
  keys(value, ['schemaVersion', 'name', 'version', 'currency', 'cases', 'gates', 'mistakeCosts', 'relations'], 'suite');
  if (value.schemaVersion !== 1) throw new Error('suite.schemaVersion must be 1');
  string(value.name, 'suite.name'); string(value.version, 'suite.version');
  if (value.currency !== undefined) string(value.currency, 'currency');
  if (!Array.isArray(value.cases) || value.cases.length === 0) throw new Error('suite.cases must not be empty');
  const ids = new Set();
  for (const c of value.cases) {
    object(c, 'case'); keys(c, ['id', 'input', 'intent', 'split', 'tags', 'assertions'], 'case');
    string(c.id, 'case.id'); string(c.intent, 'case.intent');
    if (c.intent.startsWith('__')) throw new Error('Intent names starting __ are reserved');
    if (ids.has(c.id)) throw new Error(`Duplicate case id: ${c.id}`); ids.add(c.id);
    json(c.input, `case ${c.id} input`);
    if (!['dev', 'test', 'holdout'].includes(String(c.split))) throw new Error(`case ${c.id}: split must be dev, test, or holdout`);
    if (c.tags !== undefined) strings(c.tags, 'tags');
    if (!Array.isArray(c.assertions) || c.assertions.length === 0) throw new Error(`case ${c.id}: assertions required`);
    c.assertions.forEach(validateAssertion);
    if (new Set(c.assertions.map(a => a.id)).size !== c.assertions.length) throw new Error(`case ${c.id}: duplicate assertion id`);
  }
  if (value.relations !== undefined) {
    if (!Array.isArray(value.relations)) throw new Error('relations must be array');
    const relationIds = new Set();
    for (const r of value.relations) {
      object(r, 'relation'); keys(r, ['id', 'source', 'target', 'path', 'type', 'tolerance', 'severity'], 'relation');
      for (const key of ['id', 'source', 'target', 'path']) string(r[key], `relation.${key}`);
      if (!ids.has(r.source) || !ids.has(r.target) || r.source === r.target) throw new Error('Relations require distinct existing source and target cases');
      if (!(r.path as string).startsWith('/')) throw new Error('relation.path must be JSON pointer');
      if (!['unchanged', 'changed', 'nonIncreasing', 'nonDecreasing'].includes(String(r.type))) throw new Error('Invalid relation type');
      if (r.tolerance !== undefined) number(r.tolerance, 'tolerance');
      if (r.severity !== undefined && !['normal', 'critical'].includes(String(r.severity))) throw new Error('Invalid relation severity');
      if (relationIds.has(r.id) || value.cases.some(c => c.assertions.some((a: Assertion) => a.id === r.id))) throw new Error('Relation ids must be unique and not collide with assertions');
      relationIds.add(r.id);
    }
  }
  if (value.gates !== undefined) {
    if (!Array.isArray(value.gates)) throw new Error('gates must be an array');
    for (const gate of value.gates) {
      object(gate, 'gate');
      keys(gate, ['intent', 'minCases', 'minPassRate', 'minPassRateLowerBound', 'minPrecision', 'minRecall', 'maxCriticalFailures', 'maxErrorRate', 'maxP95LatencyMs', 'maxMeanCost', 'maxMeanMistakeCost'], 'gate');
      if (gate.intent !== undefined) string(gate.intent, 'gate.intent');
      if (Object.keys(gate).filter(k => k !== 'intent').length === 0) throw new Error('gate must set at least one threshold');
      for (const [key, val] of Object.entries(gate)) {
        if (key === 'intent') continue;
        number(val, key, 0, /Rate|Precision|Recall|LowerBound/.test(key) ? 1 : Infinity);
        if (['minCases', 'maxCriticalFailures'].includes(key) && !Number.isInteger(val)) throw new Error(`${key} must be integer`);
      }
      if ((gate.minPrecision !== undefined || gate.minRecall !== undefined) && gate.intent === undefined) throw new Error('Precision/recall gates require intent');
    }
  }
  if (value.mistakeCosts !== undefined) {
    string(value.currency, 'currency is required for mistake costs');
    object(value.mistakeCosts, 'mistakeCosts');
    for (const row of Object.values(value.mistakeCosts)) { object(row, 'cost row'); for (const cost of Object.values(row)) number(cost, 'mistake cost'); }
  }
  return value as unknown as Suite;
}
export function validateObservation(value: unknown): Observation {
  object(value, 'output');
  keys(value, ['answer', 'intent', 'abstained', 'retrieved', 'citations', 'toolCalls', 'cost', 'tokens', 'data'], 'output');
  if (value.answer !== undefined && typeof value.answer !== 'string') throw new Error('answer must be string');
  if (value.intent !== undefined) { string(value.intent, 'intent'); if (value.intent.startsWith('__')) throw new Error('Reserved intent'); }
  if (value.abstained !== undefined && typeof value.abstained !== 'boolean') throw new Error('abstained must be boolean');
  for (const key of ['cost', 'tokens']) if (value[key] !== undefined) number(value[key], key);
  if (value.data !== undefined) json(value.data, 'output.data');
  for (const key of ['retrieved', 'citations', 'toolCalls']) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key])) throw new Error(`${key} must be array`);
    for (const item of value[key]) {
      object(item, key); json(item, key);
      string(item[key === 'retrieved' ? 'id' : key === 'citations' ? 'sourceId' : 'name'], key);
      for (const field of ['text', 'quote']) if (item[field] !== undefined && typeof item[field] !== 'string') throw new Error(`${field} must be string`);
    }
  }
  if (Array.isArray(value.retrieved) && new Set(value.retrieved.map(x => x.id)).size !== value.retrieved.length) throw new Error('retrieved ids must be unique');
  return value as Observation;
}
