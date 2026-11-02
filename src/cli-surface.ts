import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class UsageError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = 'UsageError';
    this.hint = hint;
  }
}

export function isUsageError(error: unknown): error is UsageError {
  return error instanceof UsageError;
}

export function toolVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const relative of ['../../package.json', '../package.json']) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(here, relative), 'utf8'));
      if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string') return parsed.version;
    } catch {
      // The compiled file lives in dist/src. A direct source runner lives in src.
    }
  }
  return '0.0.0';
}

export const COMMANDS = ['validate', 'run', 'compare', 'calibrate', 'dashboard', 'capabilities', 'robot-docs', 'help', 'version'] as const;
export type CommandName = typeof COMMANDS[number];

const FLAGS = [
  'help', 'json', 'version', 'robot-triage', 'robot-help', 'no-color', 'color', 'once',
  'port', 'out', 'replay', 'http', 'module', 'chatbot', 'revision', 'token-env',
  'concurrency', 'repetitions', 'timeout-ms', 'split', 'judge-http', 'judge-revision',
  'judge-token-env', 'min-cases', 'min-agreement',
] as const;

const GLOBAL = new Set(['help', 'json', 'version', 'robot-triage', 'robot-help', 'no-color', 'color']);

const ALLOWED: Record<CommandName, readonly string[]> = {
  dashboard: ['port', 'once'],
  validate: [],
  run: ['out', 'replay', 'http', 'module', 'chatbot', 'revision', 'token-env', 'concurrency', 'repetitions', 'timeout-ms', 'split', 'judge-http', 'judge-revision', 'judge-token-env'],
  compare: [],
  calibrate: ['min-cases', 'min-agreement'],
  capabilities: [],
  'robot-docs': [],
  help: [],
  version: [],
};

const COMMAND_HINT: Record<CommandName, string> = {
  validate: 'intentgauge validate SUITE.json',
  run: 'intentgauge run SUITE.json --replay OUTPUTS.json',
  compare: 'intentgauge compare BASELINE/report.json CANDIDATE/report.json',
  calibrate: 'intentgauge calibrate LABELS.json',
  dashboard: 'intentgauge dashboard RUNS_DIRECTORY --once',
  capabilities: 'intentgauge capabilities --json',
  'robot-docs': 'intentgauge robot-docs guide',
  help: 'intentgauge help run',
  version: 'intentgauge version',
};

const FLAG_HINT: Record<string, string> = {
  port: 'intentgauge dashboard RUNS_DIRECTORY --port 4317',
  once: 'intentgauge dashboard RUNS_DIRECTORY --once',
  out: 'intentgauge run SUITE.json --replay OUTPUTS.json --out runs/NEW_DIRECTORY',
  replay: 'intentgauge run SUITE.json --replay OUTPUTS.json',
  http: 'intentgauge run SUITE.json --http URL --revision ID',
  module: 'intentgauge run SUITE.json --module FILE',
  chatbot: 'intentgauge run SUITE.json --chatbot URL --revision ID',
  revision: 'intentgauge run SUITE.json --http URL --revision ID',
  'token-env': 'intentgauge run SUITE.json --http URL --revision ID --token-env TOKEN_ENV',
  concurrency: 'intentgauge run SUITE.json --replay OUTPUTS.json --concurrency N',
  repetitions: 'intentgauge run SUITE.json --replay OUTPUTS.json --repetitions N',
  'timeout-ms': 'intentgauge run SUITE.json --replay OUTPUTS.json --timeout-ms N',
  split: 'intentgauge run SUITE.json --replay OUTPUTS.json --split dev',
  'judge-http': 'intentgauge run SUITE.json --replay OUTPUTS.json --judge-http URL --judge-revision ID',
  'judge-revision': 'intentgauge run SUITE.json --replay OUTPUTS.json --judge-http URL --judge-revision ID',
  'judge-token-env': 'intentgauge run SUITE.json --replay OUTPUTS.json --judge-http URL --judge-revision ID --judge-token-env TOKEN_ENV',
  'min-cases': 'intentgauge calibrate LABELS.json --min-cases 30',
  'min-agreement': 'intentgauge calibrate LABELS.json --min-agreement 0.8',
  json: 'intentgauge --json',
  help: 'intentgauge --help',
  version: 'intentgauge --version',
  'robot-triage': 'intentgauge --robot-triage',
  'robot-help': 'intentgauge --robot-help',
  'no-color': 'intentgauge --no-color',
  color: 'intentgauge --color never',
};

const FLAG_AS_COMMAND: Record<string, string> = {
  replay: FLAG_HINT.replay ?? '',
  http: FLAG_HINT.http ?? '',
  module: FLAG_HINT.module ?? '',
  chatbot: FLAG_HINT.chatbot ?? '',
  json: 'intentgauge --json',
  out: FLAG_HINT.out ?? '',
  port: FLAG_HINT.port ?? '',
};

export const PARSE_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  json: { type: 'boolean' },
  version: { type: 'boolean' },
  'robot-triage': { type: 'boolean' },
  'robot-help': { type: 'boolean' },
  'no-color': { type: 'boolean' },
  color: { type: 'string' },
  once: { type: 'boolean' },
  port: { type: 'string' },
  out: { type: 'string' },
  replay: { type: 'string' },
  http: { type: 'string' },
  module: { type: 'string' },
  chatbot: { type: 'string' },
  revision: { type: 'string' },
  'token-env': { type: 'string' },
  concurrency: { type: 'string' },
  repetitions: { type: 'string' },
  'timeout-ms': { type: 'string' },
  split: { type: 'string' },
  'judge-http': { type: 'string' },
  'judge-revision': { type: 'string' },
  'judge-token-env': { type: 'string' },
  'min-cases': { type: 'string' },
  'min-agreement': { type: 'string' },
} as const;

export const HELP = `IntentGauge. AI evaluation and regression evidence.
Test behavior. See the evidence.

Usage:
  intentgauge validate SUITE.json
  intentgauge run SUITE.json (--replay OUTPUTS.json | --http URL | --module FILE | --chatbot URL) [options]
  intentgauge compare BASELINE/report.json CANDIDATE/report.json
  intentgauge calibrate LABELS.json [--min-cases 30] [--min-agreement 0.8]
  intentgauge dashboard RUNS_DIRECTORY [--port 4317] [--once]
  intentgauge capabilities [--json]
  intentgauge robot-docs guide
  intentgauge help [COMMAND]
  intentgauge version

Agent:
  intentgauge --json            Machine-readable help
  intentgauge --robot-triage    Next commands, recommendations, and health in one JSON object
  intentgauge --robot-help      Same text as: intentgauge robot-docs guide
  intentgauge capabilities --json
  intentgauge --version

Run options:
  --out DIR              New report directory (default runs/<timestamp>)
  --revision ID          Required for HTTP and chatbot targets
  --token-env NAME       Read the authorization token from this environment variable
  --concurrency N        Concurrent cases (default 4)
  --repetitions N        Repeated trials (default 1)
  --timeout-ms N         Timeout per target or evaluator call (default 30000)
  --judge-http URL       Judge endpoint: {input,output,rubric} to {score,reason}
  --judge-revision ID    Required with --judge-http
  --judge-token-env NAME Environment variable for the judge bearer token
  --split NAME           dev, test, or holdout. Selection changes the suite hash

Module exports: target (required), judge (optional), evaluators (optional).
Targets receive {id,input}, never assertions. Use .mjs or .js, or .ts on Node with TypeScript support.
HTTP uses a Bearer token. Chatbot uses the token header that service requires.
Live targets can have side effects. Replay needs no service and no credential.
--out must be a new directory. An existing report is left in place.
Exit codes: 0 gates passed or the command succeeded; 1 evaluation, regression, or calibration failed; 2 configuration or usage error.
A usage mistake prints {"error","hint"} on stderr. Copy hint. Exit 1 still prints the result on stdout.
Reports contain outputs. No automatic retries. No deployment or policy changes.
`;

const TOPICS: Record<CommandName, string> = {
  validate: `intentgauge validate SUITE.json [--json]
Prints {"valid":true,"name","cases} and exits 0.
--repetitions does not apply here.
Next: intentgauge run SUITE.json --replay OUTPUTS.json`,
  run: `intentgauge run SUITE.json (--replay OUTPUTS.json | --http URL | --module FILE | --chatbot URL) [--out DIR] [--json]
Choose exactly one target. --http and --chatbot require --revision.
Exit 0 when gates pass. Exit 1 when evaluation fails. The JSON result stays on stdout.
Exit 2 when the directory already contains a report. Use a new --out.`,
  compare: `intentgauge compare BASELINE/report.json CANDIDATE/report.json [--json]
Exit 0 when the candidate matches. Exit 1 when it regresses. JSON stays on stdout.`,
  calibrate: `intentgauge calibrate LABELS.json [--min-cases 30] [--min-agreement 0.8] [--json]
Exit 0 when the judge is eligible. Exit 1 when it is not. JSON stays on stdout.`,
  dashboard: `intentgauge dashboard RUNS_DIRECTORY [--port 4317]
intentgauge dashboard RUNS_DIRECTORY --once
--once prints saved-run JSON and exits. Without --once the process serves until stopped.`,
  capabilities: `intentgauge capabilities [--json]
Prints the version, commands, exit codes, limits, and env contract as JSON.
--json is accepted and does not change the object.`,
  'robot-docs': `intentgauge robot-docs guide [--json]
Prints the agent handbook. With --json the same text is {"guide":"..."}.`,
  help: `intentgauge help [COMMAND]
Prints this handbook, or one command. intentgauge --help does the same.`,
  version: `intentgauge version
Prints {"name":"intentgauge","version":"..."} . intentgauge --version does the same.`,
};

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  const a = [...left];
  const b = [...right];
  let previous: number[] = [];
  for (let column = 0; column <= b.length; column++) previous[column] = column;
  for (let row = 1; row <= a.length; row++) {
    const next: number[] = [row];
    for (let column = 1; column <= b.length; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      const deletion = (previous[column] ?? 0) + 1;
      const insertion = (next[column - 1] ?? 0) + 1;
      const substitution = (previous[column - 1] ?? 0) + cost;
      next[column] = Math.min(deletion, insertion, substitution);
    }
    previous = next;
  }
  return previous[b.length] ?? 0;
}

function sharedPrefix(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  return index;
}

export function closest(input: string, catalog: readonly string[]): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const name of catalog) {
    const distance = levenshtein(input, name);
    const prefix = (name.startsWith(input) && input.length >= 4) || (input.startsWith(name) && name.length >= 4);
    const near = distance <= 2 || (distance <= 3 && sharedPrefix(input, name) >= 4) || prefix;
    if (!near) continue;
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best?.name;
}

export function isCommand(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}

export function unknownCommand(command: string): UsageError {
  const asFlag = FLAG_AS_COMMAND[command];
  if (asFlag) return new UsageError(`${command} is a flag, not a command.`, asFlag);
  const guess = closest(command, COMMANDS);
  if (guess && isCommand(guess)) return new UsageError(`Unknown command: ${command}.`, COMMAND_HINT[guess]);
  return new UsageError(`Unknown command: ${command}.`, 'intentgauge --help');
}

export function flagBag(values: object): Record<string, string | boolean> {
  const bag: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'boolean') bag[key] = value;
  }
  return bag;
}

function suggestionHint(command: string | undefined, positionals: readonly string[], bad: string, suggestion: string | undefined): string {
  if (!suggestion) return 'intentgauge --help';
  const known = FLAG_HINT[suggestion];
  if (!command) return known ?? `intentgauge --${suggestion}`;
  const args = positionals.filter(token => token !== bad);
  return `intentgauge ${args.join(' ')} --${suggestion}`.replace(/\s+/g, ' ').trim();
}

export function rejectUnknownFlags(command: CommandName | undefined, values: Record<string, string | boolean>, positionals: readonly string[], allowKnown = false): void {
  const allowed = new Set<string>(GLOBAL);
  if (command) for (const key of ALLOWED[command]) allowed.add(key);
  for (const key of Object.keys(values).sort()) {
    if (!(FLAGS as readonly string[]).includes(key)) {
      const guess = closest(key, FLAGS);
      throw new UsageError(`Unknown option --${key}.`, suggestionHint(command, positionals, key, guess));
    }
    if (allowKnown || allowed.has(key)) continue;
    const hint = FLAG_HINT[key] ?? 'intentgauge --help';
    if (!command) throw new UsageError(`--${key} needs a command.`, hint);
    throw new UsageError(`--${key} does not apply to ${command}.`, hint);
  }
}

export function commandHelp(topic: string | undefined): string {
  if (!topic) return HELP;
  if (isCommand(topic)) return TOPICS[topic];
  throw unknownCommand(topic);
}

export function checkArity(command: CommandName, positionals: readonly string[]): void {
  const rest = positionals.slice(1);
  if (command === 'help') {
    if (rest.length > 1) throw new UsageError('help accepts one command name.', 'intentgauge help run');
    return;
  }
  if (command === 'capabilities' || command === 'version') {
    if (rest.length) throw new UsageError(`${command} takes no path.`, COMMAND_HINT[command]);
    return;
  }
  if (command === 'robot-docs') {
    if (rest.length !== 1 || rest[0] !== 'guide') throw new UsageError('robot-docs needs the guide topic.', 'intentgauge robot-docs guide');
    return;
  }
  if (command === 'compare') {
    if (rest.length !== 2) throw new UsageError('compare needs a baseline report and a candidate report.', COMMAND_HINT.compare);
    return;
  }
  if (rest.length !== 1 || !rest[0]) throw new UsageError(`${command} needs one path.`, COMMAND_HINT[command]);
}

export function optionalString(values: Record<string, string | boolean>, key: string): string | undefined {
  const value = values[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.startsWith('-')) {
    throw new UsageError(`--${key} needs a value.`, FLAG_HINT[key] ?? `intentgauge --${key} VALUE`);
  }
  return value;
}

export function positiveInt(raw: string | undefined, key: string): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new UsageError(`--${key} must be a positive integer.`, FLAG_HINT[key] ?? 'intentgauge --help');
  }
  return Number(raw);
}

export function finiteNumber(raw: string | undefined, key: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new UsageError(`--${key} must be a number.`, FLAG_HINT[key] ?? 'intentgauge --help');
  return value;
}

export function portNumber(raw: string | undefined): number {
  if (raw === undefined) return 4317;
  if (!/^[0-9]+$/.test(raw) || Number(raw) > 65535) {
    throw new UsageError('--port must be an integer from 0 to 65535.', FLAG_HINT.port ?? 'intentgauge dashboard RUNS_DIRECTORY --port 4317');
  }
  return Number(raw);
}

export function machineHelp(version: string) {
  return {
    tool: 'intentgauge',
    version,
    summary: 'AI evaluation and regression evidence.',
    commands: COMMANDS,
    read_json: ['validate', 'run', 'compare', 'calibrate', 'capabilities', 'version'],
    exit_codes: {
      '0': 'gates passed or the command succeeded',
      '1': 'evaluation, regression, or calibration failed',
      '2': 'configuration or usage error',
    },
    next: ['intentgauge capabilities --json', 'intentgauge --robot-triage', 'intentgauge robot-docs guide'],
  };
}

export function versionDocument(version: string) {
  return { name: 'intentgauge', version };
}

export function capabilities(version: string) {
  return {
    tool_name: 'intentgauge',
    version,
    api_version: 1,
    contract_version: '1',
    features: ['json_output', 'robot_triage', 'robot_docs', 'levenshtein_typo_hint', 'deterministic_robot_output', 'stdout_data_stderr_diagnostics'],
    commands: {
      validate: { description: 'Parse a suite and report its name and case count.', mutates: false, json: true, robot: '--json', args: [{ name: 'SUITE.json', required: true, type: 'path' }], exit_codes: [0, 2] },
      run: { description: 'Evaluate a suite and write a new report directory.', mutates: true, json: true, robot: '--json', side_effects: 'Writes report.json and report.html. Refuses to replace an existing report. --http and --chatbot call a live service.', safe_alternative: 'intentgauge run SUITE.json --replay OUTPUTS.json --out runs/NEW_DIRECTORY', exit_codes: [0, 1, 2] },
      compare: { description: 'Compare a baseline report with a candidate report.', mutates: false, json: true, robot: '--json', exit_codes: [0, 1, 2] },
      calibrate: { description: 'Score judge eligibility against held-out labels.', mutates: false, json: true, robot: '--json', exit_codes: [0, 1, 2] },
      dashboard: { description: 'Serve saved runs until stopped. --once prints the saved-run summary as JSON and exits.', mutates: false, json: true, long_running: true, safe_alternative: 'intentgauge dashboard RUNS_DIRECTORY --once', exit_codes: [0, 2] },
      capabilities: { description: 'Print this contract as JSON.', mutates: false, json: true, robot: '--json', exit_codes: [0, 2] },
      'robot-docs': { description: 'Print the agent handbook.', mutates: false, json: true, robot: '--json', args: [{ name: 'guide', required: true, type: 'topic' }], exit_codes: [0, 2] },
      help: { description: 'Print human help for one command or the whole tool.', mutates: false, json: false, exit_codes: [0, 2] },
      version: { description: 'Print the package name and version as JSON.', mutates: false, json: true, exit_codes: [0, 2] },
    },
    exit_codes: {
      '0': { meaning: 'gates passed or the command succeeded', retryable: false },
      '1': { meaning: 'evaluation, regression, or calibration failed; stdout holds the result', retryable: false },
      '2': { meaning: 'configuration or usage error; stderr holds error and, for usage mistakes, hint', retryable: false },
    },
    exit_code_note: 'Exit 1 is a failed gate, not a usage error. These three codes are the product contract. Do not remap them.',
    flags: {
      global: {
        '--json': 'Accept JSON on read commands. With no command, print machine help.',
        '--robot-triage': 'One JSON object: quick_ref, recommendations, commands, health.',
        '--robot-help': 'Alias of robot-docs guide.',
        '--version': 'Alias of version.',
        '--help': 'Human help. Also -h.',
        '--no-color': 'Accepted. Help and robot text are already plain.',
        '--color': 'Accepted. The CLI does not emit color.',
      },
    },
    env_vars: {
      NO_COLOR: { description: 'Accepted. The CLI emits no color, so the output does not change.', default: 'unset' },
      CI: { description: 'Accepted. The CLI emits no color or progress bar.', default: 'unset' },
      SOURCE_DATE_EPOCH: { description: 'Robot surfaces omit wall-clock timestamps. A saved run report still records its own clock.', default: 'unset' },
    },
    limits: { max_concurrency: 256, max_repetitions: 1000, max_timeout_ms: 2147483647, default_timeout_ms: 30000, default_concurrency: 4, default_repetitions: 1, default_dashboard_port: 4317 },
    robot_docs_uri: 'intentgauge robot-docs guide',
    mega_command: 'intentgauge --robot-triage',
  };
}

export function robotGuide(): string {
  return `IntentGauge agent guide

Read the contract:
  intentgauge capabilities --json
One call for the next step:
  intentgauge --robot-triage
Version:
  intentgauge version

Exit codes stay fixed:
  0  the command succeeded, or the gates passed
  1  evaluation, regression, or calibration failed. Stdout is the result. Do not retry the same inputs.
  2  configuration or usage error. Stderr is JSON. Copy the hint field.

Stdout is data. Stderr is diagnostics.

Offline checks:
  intentgauge validate examples/rag/suite.json
  intentgauge run examples/rag/suite.json --replay examples/rag/outputs.json
  intentgauge compare BASELINE/report.json CANDIDATE/report.json

validate, run, compare, calibrate, capabilities, and version print JSON. --json is accepted on the read commands and does not change that shape.
dashboard without --once prints one JSON listen line, then serves HTTP until stopped.
One-shot read of saved runs:
  intentgauge dashboard RUNS_DIRECTORY --once

Choose exactly one run target: --replay, --http, --module, or --chatbot.
Live --http and --chatbot require --revision.
--out must be a new directory. An existing report is kept. Point --out at a different directory.
--repetitions, --concurrency, and --timeout-ms belong to run, not validate.
A live target can change remote state. The offline substitute is --replay.

A mistyped command or flag, such as valdiate or --jsno, exits 2. The hint names the corrected command.
Help is plain text. NO_COLOR, CI, and --no-color do not change it.
`;
}

export function robotDocs(asJson: boolean): string {
  const guide = robotGuide();
  return asJson ? JSON.stringify({ guide }) : guide;
}

export function robotTriage(version: string) {
  const commands = [
    'intentgauge validate examples/rag/suite.json',
    'intentgauge run examples/rag/suite.json --replay examples/rag/outputs.json',
    'intentgauge compare BASELINE/report.json CANDIDATE/report.json',
    'intentgauge capabilities --json',
    'intentgauge robot-docs guide',
    'intentgauge dashboard RUNS_DIRECTORY --once',
  ];
  const body = {
    tool_version: version,
    contract_version: '1',
    quick_ref: {
      summary: 'Validate a suite, replay recorded outputs, then compare reports. Live targets need --revision.',
      top_3: [
        { id: 'validate', command: commands[0], reason: 'Reject a bad suite before spending a run.' },
        { id: 'replay', command: commands[1], reason: 'Score recorded outputs with no network and no credentials.' },
        { id: 'compare', command: commands[2], reason: 'Exit 1 when the candidate regresses against the baseline.' },
      ],
    },
    recommendations: [
      { id: 'replay-demo', title: 'Run the offline RAG demo', reason: 'Confirms the tool, the suite, and a passing gate without a service.', command: commands[1] },
      { id: 'compare-regression', title: 'Compare a known regression', reason: 'Exit 1 is the regression signal. Read stdout JSON.', command: commands[2] },
    ],
    commands,
    health: { offline_ok: true, network_required: false, destructive_commands: false, stdout: 'data', stderr: 'diagnostics' },
    warnings: [] as string[],
  };
  return { ...body, data_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16) };
}
