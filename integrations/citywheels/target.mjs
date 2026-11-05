import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

export const root = resolve(process.env.CITYWHEELS_PYTHON_ROOT ?? fileURLToPath(new URL('../../../EternalChat copy/help-desk-agent/help-desk-agent/', import.meta.url)));
const bridge = fileURLToPath(new URL('./bridge.py', import.meta.url));
const identity = createHash('sha256');
async function fingerprint(directory, pattern) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '__pycache__') await fingerprint(path, pattern); }
    else if (pattern.test(entry.name)) identity.update(path.slice(root.length)).update(await readFile(path));
  }
}
await fingerprint(join(root, 'citywheels'), /\.py$/);
await fingerprint(join(root, 'data'), /\.(json|md)$/);
identity.update(await readFile(bridge));
identity.update(await readFile(new URL('./target.mjs', import.meta.url)));
const artifactRevision = identity.digest('hex');
export function createTarget({ live = false, model = 'gpt-4o-mini' } = {}) {
  if (live && !process.env.OPENAI_API_KEY?.trim()) throw new Error('Live mode needs OPENAI_API_KEY. Set it in your shell or use node --env-file=/path/to/.env.');
  if (typeof model !== 'string' || !model.trim() || model.startsWith('--')) throw new Error('Invalid model name');
  return {
    name: `CityWheels / help-desk-agent (Python) / ${live ? 'OpenAI ' + model : 'offline fake model'}`,
    revision: createHash('sha256').update(JSON.stringify({ artifactRevision, live, model: live ? model : 'fake-helpdesk' })).digest('hex'),
    execute({ input }, { signal }) {
      return new Promise((resolveOutput, reject) => {
        const env = { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' };
        if (live) { env.OPENAI_API_KEY = process.env.OPENAI_API_KEY; if (process.env.OPENAI_BASE_URL) env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL; }
        const child = spawn('python3', ['-I', '-B', bridge, root, ...(live ? ['--live', '--model', model] : [])], { signal, stdio: ['pipe', 'pipe', 'pipe'], env });
        let out = '', err = '';
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { out += chunk; if (out.length > 2_000_000) child.kill(); });
        child.stderr.on('data', chunk => { err = (err + chunk).slice(-4000); });
        child.on('error', reject); child.stdin.on('error', () => {});
        child.on('close', code => {
          if (code !== 0) return reject(new Error('help-desk-agent bridge failed: ' + err));
          try { resolveOutput(JSON.parse(out)); } catch (error) { reject(error); }
        });
        child.stdin.end(JSON.stringify(input));
      });
    },
  };
}
export const target = createTarget();
export const evaluators = [{ id: 'refund-currency-answer', revision: '4', async evaluate(testCase, output) {
  const expected = testCase.assertions.find(a => a.id === 'refund-amount');
  if (!expected) return { id: 'refund-currency-answer', status: 'pass', severity: 'critical', score: 1, reason: 'No fixed refund amount for this case' };
  const pattern = /(?:€\s*|\bEUR\b\s*)(\d+(?:[.,]\d{1,2})?)(?!\d|[.,]\d)|(?<![\d.,])(\d+(?:[.,]\d{1,2})?)\s*(?:€|\bEUR\b|\beuros?\b)/gi;
  const amounts = [...String(output.answer ?? '').matchAll(pattern)].map(m => Number((m[1] ?? m[2]).replace(',', '.')));
  const pass = expected.value === 0 ? amounts.every(amount => amount === 0) : amounts.includes(expected.value);
  const reason = expected.value === 0 ? 'Answer must not state a refund above 0 EUR; saying that nothing is refunded is accepted' : `Answer must mention the fixed refund of ${expected.value} EUR; equivalent euro notation is accepted`;
  return { id: 'refund-currency-answer', status: pass ? 'pass' : 'fail', severity: 'critical', score: pass ? 1 : 0, reason };
} }];
