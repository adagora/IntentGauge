import { run, validateSuite, readJson, saveReport, compare } from '../../dist/src/index.js';
import { renderProjectDashboard } from '../../dist/src/dashboard-project.js';
import { createTarget, evaluators } from './target.mjs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(['--live', '--check']);
const values = new Set(['--model', '--case', '--repetitions']);
const parsed = {};
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (flags.has(name)) parsed[name] = true;
  else if (values.has(name) && args[i + 1] && !args[i + 1].startsWith('--')) parsed[name] = args[++i];
  else throw new Error('Usage: run.mjs [--live] [--check] [--model NAME] [--case ID] [--repetitions 1..10]');
}
const live = !!parsed['--live'];
if (parsed['--model'] && !live) throw new Error('--model requires --live');
const repetitions = Number(parsed['--repetitions'] ?? 1);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('--repetitions must be between 1 and 10');
const target = createTarget({ live, model: parsed['--model'] ?? 'gpt-4o-mini' });
const raw = await readJson(new URL('./suite.json', import.meta.url));
if (parsed['--case']) {
  raw.cases = raw.cases.filter(c => c.id === parsed['--case']);
  if (!raw.cases.length) throw new Error('Unknown case ID');
  raw.relations = (raw.relations ?? []).filter(r => r.source === parsed['--case'] && r.target === parsed['--case']);
}
const suite = validateSuite(raw);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = resolve(`runs/citywheels-${live ? 'live-' : ''}${stamp}`);
const options = { concurrency: live ? 2 : 4, timeoutMs: live ? 180000 : 30000, repetitions, evaluators };
console.log(`${live ? 'LIVE OpenAI calls (billable)' : 'Offline scripted provider'}: ${suite.cases.length} case(s), ${repetitions} repetition(s).`);
const baseline = await run(suite, target, options);
await saveReport(baseline, directory);
await writeFile(directory + '/suite.json', JSON.stringify(suite, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
await writeFile(directory + '/dashboard.html', renderProjectDashboard(baseline, suite), { flag: 'wx', mode: 0o600 });
const summary = { provider: live ? 'openai' : 'fake', model: live ? parsed['--model'] ?? 'gpt-4o-mini' : 'fake-helpdesk', cases: suite.cases.length, baselinePassed: baseline.passed, report: directory + '/report.json', dashboard: directory + '/dashboard.html' };
if (live || parsed['--check'] || parsed['--case']) {
  console.log(JSON.stringify(summary, null, 2));
  if (!baseline.passed) process.exitCode = 1;
} else {
  const { target: regressed } = await import('./regressed.mjs');
  const candidate = await run(suite, regressed, options);
  const candidateDirectory = directory + '-injected-regression';
  await saveReport(candidate, candidateDirectory);
  await writeFile(candidateDirectory + '/suite.json', JSON.stringify(suite, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const comparison = compare(baseline, candidate);
  for (const path of [directory, candidateDirectory]) await writeFile(path + '/comparison.json', JSON.stringify(comparison, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(candidateDirectory + '/dashboard.html', renderProjectDashboard(candidate, suite, { baseline }), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...summary, regressionDetected: !comparison.passed, regressionDashboard: candidateDirectory + '/dashboard.html', comparison: directory + '/comparison.json' }, null, 2));
  if (!baseline.passed || comparison.passed) process.exitCode = 1;
}
