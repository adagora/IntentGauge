#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { replay, readJson, httpJudge, httpTarget } from './adapters.js';
import { chatbotTarget } from './chatbot.js';
import { calibrate } from './calibration.js';
import { compare, parseReport, saveReport } from './reports.js';
import { run } from './runner.js';
import { dashboardSnapshot, startDashboard } from './dashboard.js';
import { validateSuite } from './validation.js';
import type { Evaluator, Judge, Observation, Target } from './types.js';
import {
  HELP, PARSE_OPTIONS, UsageError, capabilities, checkArity, commandHelp, finiteNumber, flagBag,
  isCommand, isUsageError, machineHelp, optionalString, portNumber, positiveInt, rejectUnknownFlags,
  robotDocs, robotTriage, toolVersion, unknownCommand, versionDocument,
} from './cli-surface.js';

function env(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const value = process.env[name];
  if (!value) throw new UsageError(`Environment variable ${name} is missing or empty.`, `intentgauge run SUITE.json --http URL --revision ID --token-env ${name}`);
  return value;
}

async function loadJson(path: string, hint: string): Promise<unknown> {
  try { return await readJson(path); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(message, hint);
  }
}

function fail(message: string, hint?: string): never {
  throw hint ? new UsageError(message, hint) : new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isTarget(value: unknown): value is Target {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string' && typeof value.revision === 'string' && typeof value.execute === 'function';
}
function isJudge(value: unknown): value is Judge {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string' && typeof value.revision === 'string' && typeof value.evaluate === 'function';
}
function isEvaluator(value: unknown): value is Evaluator {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.revision === 'string' && typeof value.evaluate === 'function';
}

async function main() {
  let parsed: ReturnType<typeof parseArgs>;
  try { parsed = parseArgs({ allowPositionals: true, strict: false, options: PARSE_OPTIONS }); }
  catch (error) { fail(error instanceof Error ? error.message : String(error), 'intentgauge --help'); }
  const values = flagBag(parsed.values);
  const positionals = parsed.positionals;
  const version = toolVersion();
  if (values['robot-triage'] === true) {
    rejectUnknownFlags(undefined, values, positionals, true);
    console.log(JSON.stringify(robotTriage(version)));
    return;
  }
  if ((values.version === true || positionals[0] === 'version') && values.help !== true) {
    rejectUnknownFlags(positionals[0] === 'version' ? 'version' : undefined, values, positionals);
    if (positionals[0] === 'version') checkArity('version', positionals);
    console.log(JSON.stringify(versionDocument(version)));
    return;
  }
  if (values['robot-help'] === true) {
    rejectUnknownFlags(undefined, values, positionals);
    console.log(robotDocs(values.json === true));
    return;
  }
  const command = positionals[0];
  if (!command) {
    rejectUnknownFlags(undefined, values, positionals);
    console.log(values.json === true ? JSON.stringify(machineHelp(version)) : HELP);
    return;
  }
  if (!isCommand(command)) throw unknownCommand(command);
  rejectUnknownFlags(command, values, positionals);
  if (values.help === true || command === 'help') {
    if (command === 'help') checkArity('help', positionals);
    const topic = command === 'help' ? positionals[1] : command;
    if (values.json === true) {
      console.log(JSON.stringify(topic ? { command: topic, usage: commandHelp(topic) } : machineHelp(version)));
      return;
    }
    console.log(commandHelp(topic));
    return;
  }
  checkArity(command, positionals);
  const file = positionals[1];
  const second = positionals[2];
  if (command === 'capabilities') { console.log(JSON.stringify(capabilities(version))); return; }
  if (command === 'robot-docs') { console.log(robotDocs(values.json === true)); return; }
  if (command === 'dashboard') {
    if (!file) fail('dashboard needs one path.', 'intentgauge dashboard RUNS_DIRECTORY --once');
    if (values.once === true) {
      try { console.log(JSON.stringify(await dashboardSnapshot(file))); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new UsageError(message, 'intentgauge dashboard RUNS_DIRECTORY --once');
      }
      return;
    }
    const server = startDashboard(file, portNumber(optionalString(values, 'port')));
    server.on('listening', () => {
      const address = server.address();
      console.log(JSON.stringify({ dashboard: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 4317}`, watching: resolve(file) }));
    });
    server.on('error', error => {
      console.error(JSON.stringify({ error: error.message, hint: 'intentgauge dashboard RUNS_DIRECTORY --port 4318' }));
      process.exitCode = 2;
    });
    return;
  }
  if (command === 'calibrate') {
    if (!file) fail('calibrate needs one path.', 'intentgauge calibrate LABELS.json');
    const result = calibrate(await loadJson(file, 'intentgauge calibrate LABELS.json'), finiteNumber(optionalString(values, 'min-cases'), 'min-cases') ?? 30, finiteNumber(optionalString(values, 'min-agreement'), 'min-agreement') ?? 0.8);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.eligible ? 0 : 1;
    return;
  }
  if (command === 'compare') {
    if (!file || !second) fail('compare needs a baseline report and a candidate report.', 'intentgauge compare BASELINE/report.json CANDIDATE/report.json');
    const result = compare(parseReport(await loadJson(file, 'intentgauge compare BASELINE/report.json CANDIDATE/report.json')), parseReport(await loadJson(second, 'intentgauge compare BASELINE/report.json CANDIDATE/report.json')));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
    return;
  }
  if (!file) fail(`${command} needs one path.`, command === 'validate' ? 'intentgauge validate SUITE.json' : 'intentgauge run SUITE.json --replay OUTPUTS.json');
  const suite = validateSuite(await loadJson(file, `intentgauge validate ${file}`));
  if (command === 'validate') { console.log(JSON.stringify({ valid: true, name: suite.name, cases: suite.cases.length })); return; }
  const split = optionalString(values, 'split');
  if (split) {
    if (!['dev', 'test', 'holdout'].includes(split)) throw new UsageError('Invalid --split.', 'intentgauge run SUITE.json --replay OUTPUTS.json --split dev');
    suite.cases = suite.cases.filter(item => item.split === split);
    validateSuite(suite);
  }
  const replayPath = optionalString(values, 'replay');
  const httpUrl = optionalString(values, 'http');
  const modulePath = optionalString(values, 'module');
  const chatbotUrl = optionalString(values, 'chatbot');
  if ([replayPath, httpUrl, modulePath, chatbotUrl].filter(Boolean).length !== 1) {
    throw new UsageError('Choose exactly one target: --replay, --http, --module, or --chatbot.', 'intentgauge run SUITE.json --replay OUTPUTS.json');
  }
  let target: Target, judge: Judge | undefined, evaluators: Evaluator[] | undefined;
  if (replayPath) {
    const outputs = await loadJson(replayPath, 'intentgauge run SUITE.json --replay OUTPUTS.json');
    if (!isRecord(outputs)) throw new UsageError('Replay file must be a JSON object.', 'intentgauge run SUITE.json --replay OUTPUTS.json');
    target = replay(outputs as Record<string, Observation>);
  } else if (modulePath) {
    const imported: unknown = await import(pathToFileURL(resolve(modulePath)).href);
    if (!isRecord(imported) || !isTarget(imported.target)) throw new UsageError('Module must export target', 'intentgauge run SUITE.json --module FILE');
    target = imported.target;
    if (imported.judge !== undefined) {
      if (!isJudge(imported.judge)) throw new UsageError('Module judge must export evaluate.', 'intentgauge run SUITE.json --module FILE');
      judge = imported.judge;
    }
    if (imported.evaluators !== undefined) {
      if (!Array.isArray(imported.evaluators) || !imported.evaluators.every(isEvaluator)) throw new UsageError('Module evaluators must be an array of {id,revision,evaluate}.', 'intentgauge run SUITE.json --module FILE');
      evaluators = imported.evaluators;
    }
  } else {
    const revision = optionalString(values, 'revision');
    if (!revision) throw new UsageError('--revision is required for live targets.', `intentgauge run SUITE.json --${chatbotUrl ? 'chatbot' : 'http'} URL --revision ID`);
    target = chatbotUrl ? chatbotTarget(chatbotUrl, revision, env(optionalString(values, 'token-env'))) : httpTarget(httpUrl ?? fail('--http needs a value.', 'intentgauge run SUITE.json --http URL --revision ID'), revision, env(optionalString(values, 'token-env')));
  }
  const judgeHttp = optionalString(values, 'judge-http');
  const judgeRevision = optionalString(values, 'judge-revision');
  const judgeToken = optionalString(values, 'judge-token-env');
  if (judgeHttp) {
    if (judge) throw new UsageError('Configure only one judge.', 'intentgauge run SUITE.json --replay OUTPUTS.json --judge-http URL --judge-revision ID');
    if (!judgeRevision) throw new UsageError('--judge-revision is required.', 'intentgauge run SUITE.json --replay OUTPUTS.json --judge-http URL --judge-revision ID');
    judge = httpJudge(judgeHttp, judgeRevision, env(judgeToken));
  } else if (judgeRevision || judgeToken) throw new UsageError('Judge options require --judge-http.', 'intentgauge run SUITE.json --replay OUTPUTS.json --judge-http URL --judge-revision ID');
  const concurrency = positiveInt(optionalString(values, 'concurrency'), 'concurrency');
  const repetitions = positiveInt(optionalString(values, 'repetitions'), 'repetitions');
  const timeoutMs = positiveInt(optionalString(values, 'timeout-ms'), 'timeout-ms');
  const report = await run(suite, target, { judge, evaluators, ...(concurrency ? { concurrency } : {}), ...(repetitions ? { repetitions } : {}), ...(timeoutMs ? { timeoutMs } : {}) });
  const directory = await saveReport(report, optionalString(values, 'out') ?? `runs/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  console.log(JSON.stringify({ gatesPassed: report.passed, report: `${directory}/report.json`, html: `${directory}/report.html`, ...report.summary.overall }, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}

main().catch(error => {
  if (isUsageError(error)) {
    console.error(JSON.stringify({ error: error.message, hint: error.hint }));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    const hint = message.includes('EEXIST') ? 'intentgauge run SUITE.json --replay OUTPUTS.json --out runs/NEW_DIRECTORY'
      : message.startsWith('No replay output') ? 'intentgauge run SUITE.json --replay OUTPUTS.json'
      : message.startsWith('Invalid report') ? 'intentgauge compare BASELINE/report.json CANDIDATE/report.json'
      : undefined;
    console.error(JSON.stringify(hint ? { error: message, hint } : { error: message }));
  }
  process.exitCode = 2;
});
