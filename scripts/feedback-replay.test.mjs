import assert from 'node:assert/strict';
import test from 'node:test';
import { toReplay } from './feedback-replay.mjs';

test('feedback replay keeps the answer and drops people and prompts', () => {
  const texts = new Map([['chunk-1', 'Official price: 450 EUR']]);
  const built = toReplay([{
    _id: { $oid: 'abc' },
    userEmail: 'person@example.com',
    userName: 'Hidden Name',
    rating: 'down',
    comment: 'the price is wrong',
    question: 'Panel price?',
    answer: '450 EUR',
    foundInDocuments: true,
    status: 'to_fix',
    sources: [
      { chunkId: 'chunk-1', cited: true, quote: '450 EUR', snippet: 'truncated', relPath: 'prices.pdf', page: 4 },
      { cited: true, quote: 'not in the preview', snippet: 'short preview', relPath: 'other.pdf', page: 2 },
    ],
    debug: { model: 'test-model', totalMs: 10, tokensIn: 3, tokensOut: 4, prompt: 'SECRET PROMPT', systemInstruction: 'SECRET SYSTEM' },
    fixReport: { userWasRight: 'yes', category: 'retrieval-miss' },
    conversationSnapshot: { secret: true },
  }], texts);
  assert.equal(built.suite.cases.length, 1);
  assert.equal(built.suite.cases[0].split, 'dev');
  assert.equal(built.suite.cases[0].intent, 'question');
  assert.deepEqual(built.suite.cases[0].input, { question: 'Panel price?' });
  const output = built.outputs.abc;
  assert.equal(output.answer, '450 EUR');
  assert.equal(output.abstained, false);
  assert.equal(output.tokens, 7);
  assert.equal(output.retrieved[0].text, 'Official price: 450 EUR');
  assert.equal(output.retrieved[0].metadata.textCoverage, 'full');
  assert.equal(output.retrieved[1].metadata.textCoverage, 'preview');
  assert.equal(output.citations[0].quote, '450 EUR');
  const blob = JSON.stringify(built);
  assert.equal(blob.includes('person@example.com'), false);
  assert.equal(blob.includes('Hidden Name'), false);
  assert.equal(blob.includes('SECRET PROMPT'), false);
  assert.equal(blob.includes('SECRET SYSTEM'), false);
  assert.equal(blob.includes('the price is wrong'), false);
  assert.ok(built.suite.cases[0].tags.includes('rating-down'));
  assert.ok(built.suite.cases[0].tags.includes('text-partial'));
  assert.equal(built.notes.citedWithFullText, 1);
});
