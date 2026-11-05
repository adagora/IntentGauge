import { run, validateSuite, readJson, saveReport, hash } from '../../dist/src/index.js';
import { renderProjectDashboard } from '../../dist/src/dashboard-project.js';
import { target as adapter, evaluators } from './target.mjs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.argv.length !== 3) throw new Error('Usage: node integrations/citywheels/rescore.mjs REPORT.json');
const source = await readJson(resolve(process.argv[2]));
const suite = validateSuite(await readJson(new URL('./suite.json', import.meta.url)));
if (source.suite.hash !== hash(suite)) throw new Error('Rescoring requires the exact same suite; expected outcomes must remain unchanged');
const rows = new Map(source.results.map(row => [`${row.caseId}:${row.repetition}`, row]));
const target = { name: 'RECORDED RESPONSES / rescore / ' + source.target.name, revision: hash({ sourceReport: hash(source), adapter: adapter.revision, evaluators: evaluators.map(({ id, revision }) => ({ id, revision })) }), async execute(request, context) {
  const row = rows.get(`${request.id}:${context.repetition}`);
  if (!row?.output) throw new Error(row?.error ?? 'Missing recorded response');
  const output = structuredClone(row.output);
  output.data = { ...output.data, execution: 'recorded-response-rescore', originalLatencyMs: row.latencyMs };
  return output;
} };
const report = await run(suite, target, { repetitions: source.options.repetitions, evaluators });
const directory = resolve('runs/citywheels-rescored-' + new Date().toISOString().replace(/[:.]/g, '-'));
await saveReport(report, directory);
await writeFile(directory + '/suite.json', JSON.stringify(suite, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
await writeFile(directory + '/source.json', JSON.stringify({ path: resolve(process.argv[2]), reportHash: hash(source), target: source.target, mode: 'recorded-response-rescore', newModelCalls: 0 }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
await writeFile(directory + '/dashboard.html', renderProjectDashboard(report, suite), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ newModelCalls: 0, passed: report.summary.overall.passed, cases: suite.cases.length, dashboard: directory + '/dashboard.html' }, null, 2));
if (!report.passed) process.exitCode = 1;
