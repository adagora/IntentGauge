import test from 'node:test';
import assert from 'node:assert/strict';
import { run, replay, validateSuite, validateObservation, evaluate, calibrate, agreement, wilsonLower, compare, renderHtml, hash } from '../src/index.js';
import type { Assertion, EvalCase, Observation, Suite } from '../src/types.js';

function c(assertions: Assertion[] = [{ id: 'a', type: 'contains', value: 'ok' }]): EvalCase { return { id: 'one', input: { question: 'hello' }, intent: 'support', split: 'test', assertions }; }
function suite(cases = [c()]): Suite { return { schemaVersion: 1, name: 'test', version: '1', cases }; }
function labels(rows: unknown[]) { return { schemaVersion: 1, judge: { name: 'test', revision: '1' }, datasetVersion: '1', rows }; }
async function check(a: Assertion, output: Observation) { return evaluate(a, c(), output, { signal: new AbortController().signal, repetition: 0 }); }

test('configuration rejects empty data, unknown options, duplicate ids and invalid numbers', () => {
  for (const bad of [ { ...suite(), cases: [] }, { ...suite(), typo: 1 }, suite([c(), c()]), { ...suite(), gates: [{ maxErrors: 0 }] }, suite([c([{ id: 'a', type: 'range', min: 5, max: 1 }])]), suite([c([{ id: 'a', type: 'mrr', value: [] }])]), { ...suite(), gates: [{ minPassRate: 1.1 }] } ]) assert.throws(() => validateSuite(bad));
  assert.throws(() => validateObservation({ cost: NaN }));
  assert.throws(() => validateObservation({ retrieved: [{ id: 'a' }, { id: 'a' }] }));
});
test('exact structured business fields and JSON pointer escapes', async () => {
  const o = { data: { 'a/b': { '~price': { currency: 'EUR', value: 450 } } } };
  assert.equal((await check({ id: 'a', type: 'equals', path: '/data/a~1b/~0price', value: { value: 450, currency: 'EUR' } }, o)).status, 'pass');
  assert.equal((await check({ id: 'a', type: 'equals', path: '/data/a~1b/~0price', value: { value: 450, currency: 'USD' } }, o)).status, 'fail');
});
test('forbidden content still fails when correct answer also appears', async () => {
  assert.equal((await check({ id: 'a', type: 'notContains', value: '390' }, { answer: '450 EUR, or maybe 390' })).status, 'fail');
  assert.equal((await check({ id: 'a', type: 'notContains', value: '390' }, {})).status, 'fail');
});
test('retrieval metrics match hand-computed ranking and empty results fail', async () => {
  const o = { retrieved: [{ id: 'noise' }, { id: 'a' }, { id: 'b' }] };
  const scores = { retrievalRecall: .5, retrievalPrecision: .5, mrr: .5, ndcg: (1 / Math.log2(3)) / (1 + 1 / Math.log2(3)) };
  for (const [type, expected] of Object.entries(scores)) {
    const a: Assertion = { id: 'a', type: type as Assertion['type'], value: ['a', 'b'], k: 2 };
    assert.ok(Math.abs((await check(a, o)).score! - expected) < 1e-12);
    assert.equal((await check(a, { retrieved: [] })).score, 0);
  }
});
test('citations need an actual retrieved document and literal quote', async () => {
  const a: Assertion = { id: 'a', type: 'citations' };
  assert.equal((await check(a, { retrieved: [{ id: 'a', text: '450 EUR' }], citations: [{ sourceId: 'a', quote: '450 EUR' }] })).status, 'pass');
  for (const o of [ { retrieved: [{ id: 'a', text: '450 EUR' }], citations: [{ sourceId: 'a', quote: '390 EUR' }] }, { retrieved: [], citations: [{ sourceId: 'x', quote: '450 EUR' }] }, { retrieved: [], citations: [] }, { retrieved: [{ id: 'a' }], citations: [{ sourceId: 'a', quote: '' }] } ]) assert.equal((await check(a, o)).status, 'fail');
});
test('tool scope and workflow distinguish missing from observed empty tools', async () => {
  const a: Assertion = { id: 'scope', type: 'toolAllowlist', value: [] };
  assert.equal((await check(a, {})).status, 'fail');
  assert.equal((await check(a, { toolCalls: [] })).status, 'pass');
  assert.equal((await check(a, { toolCalls: [{ name: 'write' }] })).status, 'fail');
  assert.equal((await check({ id: 'order', type: 'toolSequence', value: ['lookup', 'write'] }, { toolCalls: [{ name: 'write' }, { name: 'lookup' }] })).status, 'fail');
});
test('targets never receive gold assertions and concurrency preserves case order', async () => {
  let active = 0, peak = 0;
  const cases = Array.from({ length: 8 }, (_, i) => ({ ...c(), id: `case-${i}` }));
  const report = await run(suite(cases), { name: 'spy', revision: '1', async execute(request) {
    assert.deepEqual(Object.keys(request).sort(), ['id', 'input']); active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 5)); active--; return { answer: 'ok' };
  } }, { concurrency: 3 });
  assert.equal(peak, 3); assert.equal(report.passed, true);
  assert.deepEqual(report.results.map(r => r.caseId), cases.map(c => c.id));
});
test('target and judge failures are errors; other cases still execute', async () => {
  const s = suite([c(), { ...c([{ id: 'judge', type: 'judge', rubric: 'correct' }]), id: 'two' }]);
  const r = await run(s, replay({ two: { answer: 'ok' } }));
  assert.equal(r.summary.overall.errors, 2); assert.equal(r.passed, false);
});
test('deadline aborts cooperative target and counts failure', async () => {
  let aborted = false;
  const r = await run(suite(), { name: 'slow', revision: '1', execute(_request, { signal }) { return new Promise((_resolve, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }); }); } }, { timeoutMs: 10 });
  assert.equal(aborted, true); assert.equal(r.results[0]!.status, 'error'); assert.match(r.results[0]!.error!, /Timed out/);
});
test('judge malformed verdict and timeout cannot become passes', async () => {
  const s = suite([c([{ id: 'judge', type: 'judge', rubric: 'Does answer follow source?', severity: 'critical' }])]);
  const r = await run(s, replay({ one: { answer: 'ok' } }), { judge: { name: 'bad', revision: '1', async evaluate() { return { score: NaN, reason: 'yes' }; } } });
  assert.equal(r.results[0]!.status, 'error'); assert.equal(r.summary.overall.criticalFailures, 1);
});
test('critical failures and errors block even permissive gates', async () => {
  const s = { ...suite([c([{ id: 'critical', type: 'contains', value: 'right', severity: 'critical' }])]), gates: [{ minPassRate: 0 }] };
  const r = await run(s, replay({ one: { answer: 'wrong' } }));
  assert.equal(r.gates[0]!.passed, true); assert.equal(r.passed, false);
});
test('unknown measurement and empty intent slice fail gates', async () => {
  const s = { ...suite(), gates: [{ maxMeanCost: 10 }, { intent: 'not-present', maxErrorRate: 1 }] };
  const r = await run(s, replay({ one: { answer: 'ok' } }));
  assert.equal(r.summary.overall.meanCost, null); assert.equal(r.gates.every(g => !g.passed), true);
});
test('repeats do not inflate case confidence and unstable case is not successful', async () => {
  const r = await run(suite(), replay({ one: [{ answer: 'ok' }, { answer: 'bad' }] }), { repetitions: 2 });
  assert.equal(r.summary.overall.cases, 1); assert.equal(r.summary.overall.trials, 2);
  assert.equal(r.summary.overall.passRate, .5); assert.equal(r.summary.overall.passRateLowerBound, 0);
  assert.ok(Math.abs(wilsonLower(10, 10) - .7224672) < 1e-6);
});
test('classification counts absent predictions and asymmetric error costs', async () => {
  const s: Suite = { ...suite([c(), { ...c(), id: 'two', intent: 'urgent' }, { ...c(), id: 'three', intent: 'urgent' }]), currency: 'EUR', mistakeCosts: { urgent: { support: 1000, __missing__: 25 } } };
  const r = await run(s, replay({ one: { answer: 'ok', intent: 'support' }, two: { answer: 'ok', intent: 'support' }, three: { answer: 'ok' } }));
  assert.equal(r.summary.classification.support!.precision, .5);
  assert.equal(r.summary.classification.urgent!.recall, 0);
  assert.equal(r.summary.mistakeCost.total, 1025);
  assert.equal(r.summary.mistakeCost.mean, 1025 / 3);
});
test('unpriced classification mistakes stay unknown, not zero', async () => {
  const r = await run(suite(), replay({ one: { answer: 'ok', intent: 'other' } }));
  assert.equal(r.summary.mistakeCost.mean, null); assert.equal(r.summary.mistakeCost.coverage, 0);
});
test('paired intervention catches vulnerability that independent checks miss', async () => {
  const s: Suite = { ...suite([c([{ id: 'number', type: 'range', path: '/data/price', min: 0 }]), { ...c([{ id: 'number', type: 'range', path: '/data/price', min: 0 }]), id: 'injected' }]), relations: [{ id: 'stable-price', source: 'one', target: 'injected', type: 'unchanged', path: '/data/price', severity: 'critical' }] };
  const r = await run(s, replay({ one: { data: { price: 450 } }, injected: { data: { price: 1 } } }));
  assert.equal(r.results[1]!.checks[0]!.status, 'pass'); assert.equal(r.results[1]!.checks[1]!.status, 'fail'); assert.equal(r.passed, false);
});
test('paired missing fields never pass unchanged relation', async () => {
  const s: Suite = { ...suite([c(), { ...c(), id: 'two' }]), relations: [{ id: 'stable', source: 'one', target: 'two', type: 'unchanged', path: '/data/absent' }] };
  const r = await run(s, replay({ one: { answer: 'ok' }, two: { answer: 'ok' } })); assert.equal(r.passed, false);
});
test('calibration requires independent held-out humans and adjudication', () => {
  const row = { caseId: 'a', intent: 'pricing', rubric: 'v1', split: 'holdout', humans: [{ reviewer: 'a', value: true }, { reviewer: 'b', value: false }], judge: true };
  assert.equal(calibrate(labels([row]), 1).eligible, false);
  assert.equal(calibrate(labels([{ ...row, adjudication: { reviewer: 'c', value: true } }]), 1).eligible, false);
  assert.throws(() => calibrate(labels([{ ...row, adjudication: { reviewer: 'a', value: true } }]), 1));
  assert.throws(() => calibrate(labels([{ ...row, split: 'dev' }])));
  assert.throws(() => calibrate(labels([row, row])));
});
test('calibration cannot pool a weak intent with a large strong intent', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ caseId: String(i), intent: 'a', rubric: 'v1', split: 'holdout', humans: [{ reviewer: 'x', value: i % 2 === 0 }, { reviewer: 'y', value: i % 2 === 0 }], judge: i % 2 === 0 }));
  const r = calibrate(labels([...rows, { ...rows[0], caseId: 'small', intent: 'b' }]));
  assert.equal(r.slices[0]!.eligible, true); assert.equal(r.eligible, false);
  assert.equal(agreement([true, true], [true, true]).kappa, null);
  assert.equal(agreement([true, false], [true, false]).kappa, 1);
});
test('comparison rejects incomparable suites and finds paired regression', async () => {
  const a = await run(suite(), replay({ one: { answer: 'ok' } })), b = await run(suite(), replay({ one: { answer: 'bad' } }));
  assert.equal(compare(a, b).regressions.length, 1);
  assert.throws(() => compare(a, { ...b, suite: { ...b.suite, hash: 'other' } }));
});
test('report escapes untrusted answer content and stable hashes ignore object key order', async () => {
  const r = await run(suite(), replay({ one: { answer: '<script>alert(1)</script>' } }));
  const html = renderHtml(r);
  assert.ok(!html.includes('<script>alert(1)</script>')); assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
});
test('judge cannot mutate trusted observations or the dataset before subsequent checks', async () => {
  const s = suite([c([{ id: 'judge', type: 'judge', rubric: 'Check this' }, { id: 'truth', type: 'equals', value: 'right' }])]);
  const original = hash(s);
  const r = await run(s, replay({ one: { answer: 'wrong' } }), { judge: { name: 'mutating', revision: '1', async evaluate(request) { request.output.answer = 'right'; (request.input as Record<string, string>).question = 'changed'; return { score: 1, reason: 'yes' }; } } });
  assert.equal(r.passed, false); assert.equal(r.results[0]!.output!.answer, 'wrong'); assert.equal(hash(s), original); assert.equal(r.suite.hash, original);
});
test('ordered tool sequence permits repeated calls', async () => {
  const s = suite([c([{ id: 'workflow', type: 'toolSequence', value: ['search', 'read', 'search'] }])]);
  validateSuite(s);
  const r = await run(s, replay({ one: { toolCalls: [{ name: 'search' }, { name: 'read' }, { name: 'search' }] } })); assert.equal(r.passed, true);
});
test('positive-only calibration cannot approve an always-yes judge', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ caseId: String(i), intent: 'a', rubric: 'v1', split: 'holdout', humans: [{ reviewer: 'x', value: true }, { reviewer: 'y', value: true }], judge: true }));
  const r = calibrate(labels(rows)); assert.equal(r.eligible, false); assert.equal(r.slices[0]!.classSupport.negative, 0);
});
test('truncated previews report insufficient citation evidence, not a fabricated quote verdict', async () => {
  const r = await check({ id: 'quote', type: 'citations' }, { retrieved: [{ id: 'a', text: 'preview...', metadata: { textCoverage: 'preview' } }], citations: [{ sourceId: 'a', quote: 'text outside preview' }] }); assert.equal(r.status, 'error');
});
test('custom evaluators carry revision identity and skipped checks remain visible', async () => {
  const r = await run(suite(), replay({ one: { answer: 'ok' } }), { evaluators: [{ id: 'business', revision: 'v1', async evaluate() { return { id: 'business', severity: 'normal', status: 'skip', reason: 'Missing human label' }; } }] });
  assert.equal(r.passed, false); assert.equal(r.summary.byCheck.business!.skipped, 1); assert.equal(r.summary.byCheck.business!.meanScore, null);
  assert.deepEqual(r.evaluators, [{ id: 'business', revision: 'v1' }]);
});
