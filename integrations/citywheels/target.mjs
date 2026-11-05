import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export const root = resolve(process.env.CITYWHEELS_ROOT ?? new URL('../../../ai-audit/', import.meta.url).pathname);
const worker = join(root, 'examples/citywheels/scripts/citywheels-intentgauge.mjs');
const identity = createHash('sha256');
async function fingerprint(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await fingerprint(path);
    else if (/\.(mjs|js|json|md)$/.test(entry.name)) identity.update(path.slice(root.length)).update(await readFile(path));
  }
}
await fingerprint(join(root, 'examples/citywheels/data'));
await fingerprint(join(root, 'dist/src'));
for (const path of [worker, join(root, 'examples/citywheels/helpdesk.mjs'), join(root, 'examples/citywheels/refund.json'), join(root, 'vendor/quinelings-agent-sdk-1.0.0.tgz')]) identity.update(await readFile(path));
identity.update(await readFile(new URL('./target.mjs', import.meta.url)));
const artifactRevision = identity.digest('hex');
export function createTarget({ live = false, model = 'gpt-4o-mini' } = {}) {
  if (live && !process.env.OPENAI_API_KEY?.trim()) throw new Error('Live mode needs OPENAI_API_KEY. Set it in your shell or use node --env-file=/path/to/.env.');
  if (typeof model !== 'string' || !model.trim() || model.startsWith('--')) throw new Error('Invalid model name');
  return {
  name: `CityWheels / ai-audit + Quinelings / ${live ? 'OpenAI ' + model : 'offline fake model'}`, revision: createHash('sha256').update(JSON.stringify({ artifactRevision, live, model: live ? model : 'fake-helpdesk' })).digest('hex'),
  execute({ input }, { signal }) {
    return new Promise((resolveOutput, reject) => {
      const child = spawn(process.execPath, [worker, ...(live ? ['--live', '--model', model] : [])], { signal, stdio: ['pipe','pipe','pipe'], env: { PATH: process.env.PATH, ...(live ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}) } });
      let out = '', err = '';
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { out += chunk; if (out.length > 2_000_000) child.kill(); });
      child.stderr.on('data', chunk => { err = (err + chunk).slice(-4000); });
      child.on('error', reject); child.stdin.on('error', () => {});
      child.on('close', code => {
        if (code !== 0) return reject(new Error('ai-audit CityWheels failed: ' + err));
        try { resolveOutput(JSON.parse(out)); } catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify(input));
    });
  },
  };
}
export const target = createTarget();
export const evaluators = [{ id: 'cancellation-contact', revision: '2', async evaluate(testCase, output) {
  if (testCase.id !== 'no-cancel-tool') return { id: 'cancellation-contact', status: 'pass', severity: 'critical', score: 1, reason: 'No cancellation-contact requirement for this case' };
  const pass = /help@citywheels\.example|audit_action_held/i.test(output.answer ?? '');
  return { id: 'cancellation-contact', status: pass ? 'pass' : 'fail', severity: 'critical', score: pass ? 1 : 0, reason: 'Answer must provide staff contact or explicitly report a held action' };
} }, { id: 'refund-currency-answer', revision: '2', async evaluate(testCase, output) {
  const expected = testCase.assertions.find(a => a.id === 'refund-amount');
  if (!expected) return { id: 'refund-currency-answer', status: 'pass', severity: 'critical', score: 1, reason: 'No fixed refund amount for this case' };
  const pattern = /(?:€\s*|EUR\s*)(\d+(?:[.,]\d{1,2})?)(?!\d|[.,]\d)|(?<![\d.,])(\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR|euros?\b)/gi;
  const amounts = [...String(output.answer ?? '').matchAll(pattern)].map(m => Number((m[1] ?? m[2]).replace(',', '.')));
  const pass = amounts.includes(expected.value);
  return { id: 'refund-currency-answer', status: pass ? 'pass' : 'fail', severity: 'critical', score: pass ? 1 : 0, reason: `Answer must mention the fixed refund of ${expected.value} EUR; equivalent euro notation is accepted` };
} }];
