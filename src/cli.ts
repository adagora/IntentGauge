#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { replay, readJson, httpJudge, httpTarget } from './adapters.js';
import { chatbotTarget } from './chatbot.js';
import { calibrate } from './calibration.js';
import { compare, parseReport, saveReport } from './reports.js';
import { run } from './runner.js';
import { startDashboard } from './dashboard.js';
import { validateSuite } from './validation.js';
import type { Evaluator, Judge, Observation, Target } from './types.js';

const help = `evalLOL — evaluations for RAG and agents

Usage:
  evallol dashboard RUNS_DIRECTORY [--port 4317]
  evallol validate SUITE.json
  evallol run SUITE.json (--replay OUTPUTS.json | --http URL | --module FILE | --chatbot URL) [options]
  evallol compare BASELINE/report.json CANDIDATE/report.json
  evallol calibrate LABELS.json [--min-cases 30] [--min-agreement 0.8]

Run options:
  --out DIR             New report directory (default runs/<timestamp>)
  --revision ID         Required for HTTP/chatbot, identify model+prompt+index revision
  --token-env NAME      Read authorization token from this environment variable
  --concurrency N       Concurrent cases (default 4)
  --repetitions N       Repeated trials (default 1)
  --timeout-ms N        Timeout per target/evaluator call (default 30000)
  --judge-http URL      Judge endpoint: {input,output,rubric} → {score,reason}
  --judge-revision ID   Required for --judge-http
  --judge-token-env NAME Environment variable for judge bearer token
  --split NAME          dev, test or holdout; selection changes suite hash

Module exports: target (required), judge (optional), evaluators (optional).
Targets receive {id,input}, never assertions. Use .mjs/.js, or .ts on Node with TS support.
HTTP uses Bearer token. Chatbot uses the exact token header required by that service.
Live targets can have side effects. Replays require no services or credentials.
Exit codes: 0 gates passed; 1 evaluation/regression/calibration failed; 2 configuration error.
Reports contain outputs. No automatic retries; no deployment or policy changes.
`;
function env(name?: string) {
  if (!name) return undefined;
  const value = process.env[name]; if (!value) throw new Error(`Environment variable ${name} is missing or empty`); return value;
}
async function main() {
  const { values: v, positionals: p } = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: 'boolean', short: 'h' }, port: { type: 'string' }, out: { type: 'string' }, replay: { type: 'string' }, http: { type: 'string' }, module: { type: 'string' }, chatbot: { type: 'string' }, revision: { type: 'string' },
    'token-env': { type: 'string' }, concurrency: { type: 'string' }, repetitions: { type: 'string' }, 'timeout-ms': { type: 'string' }, split: { type: 'string' },
    'judge-http': { type: 'string' }, 'judge-revision': { type: 'string' }, 'judge-token-env': { type: 'string' }, 'min-cases': { type: 'string' }, 'min-agreement': { type: 'string' },
  } });
  if (v.help || !p.length) { console.log(help); return; }
  const [command, file, second] = p;
  if (!['validate', 'run', 'compare', 'calibrate', 'dashboard'].includes(command!)) throw new Error(`Unknown command: ${command}. Use --help.`);
  if (!file || p.length !== (command === 'compare' ? 3 : 2)) throw new Error(`Wrong arguments for ${command}. Use --help.`);
  const allowed = command === 'dashboard' ? ['port'] : command === 'run' ? ['out','replay','http','module','chatbot','revision','token-env','concurrency','repetitions','timeout-ms','split','judge-http','judge-revision','judge-token-env'] : command === 'calibrate' ? ['min-cases','min-agreement'] : [];
  for (const key of Object.keys(v)) if (key !== 'help' && !allowed.includes(key)) throw new Error(`--${key} does not apply to ${command}`);
  if (command === 'dashboard') {
    const server = startDashboard(file, Number(v.port ?? 4317));
    server.on('listening', () => { const address = server.address(); console.log(JSON.stringify({ dashboard: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 4317}`, watching: resolve(file) })); });
    server.on('error', error => { console.error(error.message); process.exitCode = 2; });
    return;
  }
  if (command === 'calibrate') {
    const result = calibrate(await readJson(file), Number(v['min-cases'] ?? 30), Number(v['min-agreement'] ?? .8)); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.eligible ? 0 : 1; return;
  }
  if (command === 'compare') {
    const result = compare(parseReport(await readJson(file)), parseReport(await readJson(second!))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.passed ? 0 : 1; return;
  }
  const suite = validateSuite(await readJson(file));
  if (command === 'validate') { console.log(JSON.stringify({ valid: true, name: suite.name, cases: suite.cases.length })); return; }
  if (v.split) {
    if (!['dev', 'test', 'holdout'].includes(v.split)) throw new Error('Invalid --split');
    suite.cases = suite.cases.filter(c => c.split === v.split); validateSuite(suite);
  }
  if ([v.replay, v.http, v.module, v.chatbot].filter(Boolean).length !== 1) throw new Error('Choose exactly one target: --replay, --http, --module, --chatbot');
  let target: Target, judge: Judge | undefined, evaluators: Evaluator[] | undefined;
  if (v.replay) target = replay(await readJson(v.replay) as Record<string, Observation>);
  else if (v.module) {
    const plugin = await import(pathToFileURL(resolve(v.module)).href); target = plugin.target; judge = plugin.judge; evaluators = plugin.evaluators;
    if (!target) throw new Error('Module must export target');
  } else {
    if (!v.revision) throw new Error('--revision is required for live targets');
    target = v.chatbot ? chatbotTarget(v.chatbot, v.revision, env(v['token-env'])) : httpTarget(v.http!, v.revision, env(v['token-env']));
  }
  if (v['judge-http']) {
    if (judge) throw new Error('Configure only one judge');
    if (!v['judge-revision']) throw new Error('--judge-revision is required');
    judge = httpJudge(v['judge-http'], v['judge-revision'], env(v['judge-token-env']));
  } else if (v['judge-revision'] || v['judge-token-env']) throw new Error('Judge options require --judge-http');
  const report = await run(suite, target, { judge, evaluators, ...(v.concurrency ? { concurrency: Number(v.concurrency) } : {}), ...(v.repetitions ? { repetitions: Number(v.repetitions) } : {}), ...(v['timeout-ms'] ? { timeoutMs: Number(v['timeout-ms']) } : {}) });
  const directory = await saveReport(report, v.out ?? `runs/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  console.log(JSON.stringify({ gatesPassed: report.passed, report: `${directory}/report.json`, html: `${directory}/report.html`, ...report.summary.overall }, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}
main().catch(error => { console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); process.exitCode = 2; });
