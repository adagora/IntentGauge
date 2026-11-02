import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readChatStream, normalizeChatbot, chatbotTarget, httpTarget, httpJudge, run } from '../src/index.js';
import type { Suite } from '../src/types.js';

test('SSE decoder consumes split UTF-8, CRLF, and verification after final', async () => {
  const text = 'event: final\r\ndata: {"answer":"Złoty panel","sources":[]}\r\n\r\nevent: verification\r\ndata: {"status":"verified"}\r\n\r\n';
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const result = await readChatStream(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
  assert.equal(result.answer, 'Złoty panel'); assert.deepEqual(result.verification, { status: 'verified' });
});
test('SSE rejects stream error, malformed JSON and absent final', async () => {
  for (const text of ['event: error\ndata: {"error":"secret"}\n\n', 'event: final\ndata: invalid\n\n', 'event: delta\ndata: "partial"\n\n']) await assert.rejects(() => readChatStream(new Response(text, { headers: { 'content-type': 'text/event-stream' } })));
});
test('chatbot normalization keeps table/version evidence and omits raw prompts and unknown costs', () => {
  const r = normalizeChatbot({ answer: '450', foundInDocuments: true, sources: [{ chunkId: 'price-p4', snippet: '450 EUR', quote: '450 EUR', cited: true, versionId: 'v2', page: 4, cell: { row: '200', column: '120', value: '450' } }], debug: { prompt: 'sensitive context', cost: 0 } });
  assert.equal(r.citations![0]!.metadata!.versionId, 'v2'); assert.equal(r.cost, undefined); assert.equal(JSON.stringify(r).includes('sensitive'), false);
});
test('HTTP target and judge request/response contracts with no gold leakage (mock transport)', async t => {
  const received: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    received.push(JSON.parse(init.body as string));
    assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-token');
    return Response.json(url.pathname === '/judge' ? { score: 1, reason: 'Matches evidence' } : { answer: 'ok' });
  });
  const url = 'https://eval.invalid';
  const suite: Suite = { schemaVersion: 1, name: 'http', version: '1', cases: [{ id: 'one', input: 'question', intent: 'a', split: 'test', assertions: [{ id: 'j', type: 'judge', rubric: 'Answer must be ok.' }] }] };
  const r = await run(suite, httpTarget(url, 'model-1', 'test-token'), { judge: httpJudge(`${url}/judge`, 'judge-1', 'test-token') });
  assert.equal(r.passed, true); assert.deepEqual(received[0], { id: 'one', input: 'question' });
  assert.deepEqual(Object.keys(received[1] as object).sort(), ['input', 'output', 'rubric']);
});
test('chatbot adapter isolates conversations across repeats and retains late verification (mock transport)', async t => {
  const requests: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get('authorization'), 'raw-token');
    const body = JSON.parse(init.body as string); requests.push(body);
    const conversationId = body.conversationId ?? `conversation-${requests.length}`;
    const final = { answer: 'ok', conversationId, sources: [{ chunkId: '', relPath: 'catalog.pdf', index: 1, page: 4, snippet: 'ok' }] };
    return new Response(`event: final\ndata: ${JSON.stringify(final)}\n\nevent: verification\ndata: {"status":"verified"}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const suite: Suite = { schemaVersion: 1, name: 'chat', version: '1', cases: [{ id: 'chat', intent: 'a', split: 'test', input: { turns: ['first', 'second'] }, assertions: [{ id: 'late-check', type: 'equals', path: '/data/verification/status', value: 'verified' }] }] };
  const r = await run(suite, chatbotTarget('https://eval.invalid/api/chat', 'r1', 'raw-token'), { repetitions: 2, concurrency: 1 });
  assert.equal(r.passed, true); assert.equal(requests.length, 4);
  assert.equal(requests[0]!.conversationId, undefined); assert.equal(requests[1]!.conversationId, 'conversation-1');
  assert.equal(requests[2]!.conversationId, undefined); assert.equal(requests[3]!.conversationId, 'conversation-3');
  assert.match(r.results[0]!.output!.retrieved![0]!.id, /^document:/);
});
test('CLI workflows: artifacts, successful suites, real regressions, validation and comparison', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evallol-test-'));
  function cli(...args: string[]) { return spawnSync(process.execPath, ['dist/src/cli.js', ...args], { encoding: 'utf8' }); }
  for (const name of ['rag', 'agent', 'robustness']) {
    const result = cli('run', `examples/${name}/suite.json`, '--replay', `examples/${name}/outputs.json`, '--out', join(root, name));
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(await readFile(join(root, name, 'report.html'), 'utf8'), /Case evidence/);
  }
  const regression = cli('run', 'examples/rag/suite.json', '--replay', 'examples/rag/regressed.json', '--out', join(root, 'bad'));
  assert.equal(regression.status, 1);
  assert.equal(cli('compare', join(root, 'rag/report.json'), join(root, 'bad/report.json')).status, 1);
  assert.equal(cli('run', 'examples/robustness/suite.json', '--replay', 'examples/robustness/vulnerable.json', '--out', join(root, 'vulnerable')).status, 1);
  assert.equal(cli('validate', 'examples/rag/suite.json').status, 0);
  assert.equal(cli('calibrate', 'examples/calibration.json').status, 0);
  assert.equal(cli('validate', 'examples/rag/suite.json', '--repetitions', '2').status, 2);
  assert.equal(cli('run', 'examples/rag/suite.json', '--replay', 'examples/rag/outputs.json', '--out', join(root, 'rag')).status, 2);
});
