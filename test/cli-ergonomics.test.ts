import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { closest } from '../src/cli-surface.js';

function cli(...args: string[]) {
  return spawnSync(process.execPath, ['dist/src/cli.js', ...args], { encoding: 'utf8' });
}
function stderrJson(result: ReturnType<typeof cli>): { error?: string; hint?: string } {
  return JSON.parse(result.stderr) as { error?: string; hint?: string };
}

test('closest spellings stay inside the real catalog', () => {
  assert.equal(closest('valdiate', ['validate', 'run', 'compare']), 'validate');
  assert.equal(closest('jsno', ['json', 'help', 'version']), 'json');
  assert.equal(closest('jason', ['json', 'help']), 'json');
  assert.equal(closest('zzzz', ['validate', 'run']), undefined);
});

test('bare help, machine help, version, and robot surfaces are deterministic and plain', () => {
  const help = cli();
  assert.equal(help.status, 0);
  assert.equal(help.stderr, '');
  assert.equal(help.stdout.includes('\u001b'), false);
  assert.match(help.stdout, /capabilities --json/);
  assert.match(help.stdout, /robot-docs guide/);
  assert.match(help.stdout, /--robot-triage/);
  const again = cli('--help');
  assert.equal(again.stdout, help.stdout);
  const machine = cli('--json');
  assert.equal(machine.status, 0);
  assert.equal(machine.stderr, '');
  const parsed = JSON.parse(machine.stdout) as { commands: string[]; exit_codes: Record<string, string> };
  assert.ok(parsed.commands.includes('capabilities'));
  assert.match(parsed.exit_codes['1'] ?? '', /calibration failed/);
  const version = cli('--version');
  const versionCommand = cli('version');
  assert.equal(version.status, 0);
  assert.equal(version.stdout, versionCommand.stdout);
  assert.equal(JSON.parse(version.stdout).name, 'intentgauge');
  assert.equal(cli('--no-color').stdout, help.stdout);
});

test('capabilities and robot-triage are stable JSON contracts', () => {
  const first = cli('capabilities', '--json');
  const second = cli('capabilities');
  assert.equal(first.status, 0);
  assert.equal(first.stderr, '');
  assert.equal(first.stdout, second.stdout);
  const contract = JSON.parse(first.stdout) as { exit_codes: Record<string, { meaning: string }>; commands: Record<string, unknown>; mega_command: string };
  assert.match(contract.exit_codes['0']?.meaning ?? '', /gates passed/);
  assert.match(contract.exit_codes['1']?.meaning ?? '', /calibration failed/);
  assert.match(contract.exit_codes['2']?.meaning ?? '', /usage error/);
  assert.equal(typeof contract.commands.validate, 'object');
  assert.equal(contract.mega_command, 'intentgauge --robot-triage');
  const triage = cli('--robot-triage');
  const triageAgain = cli('--robot-triage', '--json');
  assert.equal(triage.status, 0);
  assert.equal(triage.stderr, '');
  assert.equal(triage.stdout, triageAgain.stdout);
  assert.equal(/\d{4}-\d{2}-\d{2}T/.test(triage.stdout), false);
  const body = JSON.parse(triage.stdout) as { quick_ref: unknown; recommendations: unknown; commands: string[]; health: unknown };
  assert.ok(body.quick_ref && body.recommendations && body.commands.length >= 3 && body.health);
  const guide = cli('robot-docs', 'guide');
  assert.equal(guide.status, 0);
  assert.match(guide.stdout, /intentgauge validate/);
  assert.match(guide.stdout, /--replay/);
  assert.equal(guide.stdout.includes('\u001b'), false);
  const guideJson = JSON.parse(cli('robot-docs', 'guide', '--json').stdout) as { guide: string };
  assert.match(guideJson.guide, /Exit codes stay fixed/);
  assert.equal(cli('--robot-help').stdout, guide.stdout);
});

test('usage mistakes name the exact next command and exit 2', () => {
  const typo = cli('valdiate', 'examples/rag/suite.json');
  assert.equal(typo.status, 2);
  assert.equal(typo.stdout, '');
  assert.match(stderrJson(typo).hint ?? '', /^intentgauge validate SUITE\.json$/);
  const flag = cli('validate', 'examples/rag/suite.json', '--jsno');
  assert.equal(flag.status, 2);
  assert.match(stderrJson(flag).hint ?? '', /--json/);
  const repetitions = cli('validate', 'examples/rag/suite.json', '--repetitions', '2');
  assert.equal(repetitions.status, 2);
  assert.match(stderrJson(repetitions).hint ?? '', /intentgauge run SUITE\.json --replay OUTPUTS\.json --repetitions N/);
  const missingTarget = cli('run', 'examples/rag/suite.json');
  assert.equal(missingTarget.status, 2);
  assert.match(stderrJson(missingTarget).hint ?? '', /--replay OUTPUTS\.json/);
  const replayCommand = cli('replay', 'examples/rag/outputs.json');
  assert.equal(replayCommand.status, 2);
  assert.match(stderrJson(replayCommand).hint ?? '', /--replay/);
  const missingFile = cli('validate', 'examples/no-such-suite.json');
  assert.equal(missingFile.status, 2);
  assert.match(stderrJson(missingFile).hint ?? '', /validate/);
  const bareFlag = cli('--jsno');
  assert.equal(bareFlag.status, 2);
  assert.match(stderrJson(bareFlag).hint ?? '', /intentgauge --json/);
});

test('read commands accept --json and keep exit 0 and exit 1', async () => {
  const valid = cli('validate', 'examples/rag/suite.json', '--json');
  assert.equal(valid.status, 0);
  assert.equal(valid.stderr, '');
  assert.equal(JSON.parse(valid.stdout).valid, true);
  const root = await mkdtemp(join(tmpdir(), 'evallol-test-'));
  const pass = cli('run', 'examples/rag/suite.json', '--replay', 'examples/rag/outputs.json', '--out', join(root, 'ok'), '--json');
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(JSON.parse(pass.stdout).gatesPassed, true);
  const fail = cli('run', 'examples/rag/suite.json', '--replay', 'examples/rag/regressed.json', '--out', join(root, 'bad'));
  assert.equal(fail.status, 1);
  assert.equal(JSON.parse(fail.stdout).gatesPassed, false);
  const compared = cli('compare', join(root, 'ok/report.json'), join(root, 'bad/report.json'), '--json');
  assert.equal(compared.status, 1);
  assert.equal(JSON.parse(compared.stdout).passed, false);
  const replaced = cli('run', 'examples/rag/suite.json', '--replay', 'examples/rag/outputs.json', '--out', join(root, 'ok'));
  assert.equal(replaced.status, 2);
  assert.match(stderrJson(replaced).hint ?? '', /NEW_DIRECTORY/);
  assert.equal(cli('calibrate', 'examples/calibration.json', '--json').status, 0);
});
