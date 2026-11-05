import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTarget, evaluators } from './target.mjs';

test('live target requires a key and mode/model affect identity without exposing credentials', () => {
  const previous = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    assert.throws(() => createTarget({ live: true }), /OPENAI_API_KEY/);
    const offline = createTarget();
    process.env.OPENAI_API_KEY = 'sk-TEST-FAKE-NEVER-SENT';
    const live = createTarget({ live: true });
    assert.notEqual(offline.revision, live.revision);
    assert.notEqual(live.revision, createTarget({ live: true, model: 'another-test-model' }).revision);
    assert.equal(JSON.stringify(live).includes(process.env.OPENAI_API_KEY), false);
    assert.equal(createTarget().revision, offline.revision);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('refund answer checks accept equivalent euro formatting and reject wrong amounts', async () => {
  const evaluator = evaluators.find(e => e.id === 'refund-currency-answer');
  const scenario = { id: 'refund', assertions: [{ id: 'refund-amount', value: 340 }] };
  for (const answer of ['€340', '€340.', '€340, which includes the deposit.', '340 EUR', 'EUR 340', '340.00 euros', '€340,00']) assert.equal((await evaluator.evaluate(scenario, { answer })).status, 'pass', answer);
  for (const answer of ['€342', '€1340', '€3400', '€340.50', 'contact staff']) assert.equal((await evaluator.evaluate(scenario, { answer })).status, 'fail', answer);
});

test('cancellation can be explained by a held action or staff contact', async () => {
  const evaluator = evaluators.find(e => e.id === 'cancellation-contact');
  for (const answer of ['audit_action_held', 'Please contact help@citywheels.example']) assert.equal((await evaluator.evaluate({ id: 'no-cancel-tool' }, { answer })).status, 'pass');
  assert.equal((await evaluator.evaluate({ id: 'no-cancel-tool' }, { answer: 'Done.' })).status, 'fail');
});
