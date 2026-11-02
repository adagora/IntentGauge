import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { escapeHtml, parseReport, renderHtml } from './reports.js';
import { dashboardHtml } from './dashboard-ui.js';
import { renderProjectDashboard } from './dashboard-project.js';
import { validateSuite } from './validation.js';
import { hash } from './runner.js';
import type { RunReport, Suite } from './types.js';

async function savedReports(directory: string) {
  const root = resolve(directory), entries = await readdir(root, { withFileTypes: true });
  const paths = [join(root, 'report.json'), ...entries.filter(e => e.isDirectory()).map(e => join(root, e.name, 'report.json'))];
  const candidates = await Promise.all(paths.map(async path => {
    try { return { path, modified: (await stat(path)).mtimeMs }; } catch { return null; }
  }));
  const runs: { report: RunReport; directory: string }[] = []; let unreadable = 0;
  for (const candidate of candidates.filter(c => c !== null).sort((a, b) => b.modified - a.modified).slice(0, 30)) {
    try { const report = parseReport(JSON.parse(await readFile(candidate.path, 'utf8'))); runs.push({ report, directory: dirname(candidate.path) }); }
    catch { unreadable++; }
  }
  return { runs, unreadable };
}

/** Summary endpoint deliberately excludes raw answers, inputs and check reasons. */
export async function dashboardSnapshot(directory: string) {
  const { runs, unreadable } = await savedReports(directory);
  const reports = runs.map(({ report: r }) => ({ id: r.id, createdAt: r.createdAt, suite: r.suite, target: r.target, judge: r.judge,
    options: r.options, passed: r.passed, summary: r.summary, gates: r.gates,
    trials: r.results.map(t => ({ caseId: t.caseId, repetition: t.repetition, status: t.status,
      checks: t.checks.map(c => ({ id: c.id, status: c.status, severity: c.severity })) })) }));
  return { reports, unreadable };
}

function library(runs: { report: RunReport }[], unreadable: number) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>evalLOL / saved runs</title><style>body{font:16px/1.7 system-ui;background:#141a1d;color:#e3e9eb;max-width:1000px;margin:30px auto;padding:20px}a{color:#f2c478}li{margin:18px 0}small{color:#a3b2b9}</style><h1>Saved evaluations</h1><p>Choose a run. These are completed artifacts, not a live production monitor.</p>'+(runs.length?'<ul>'+runs.map(({report:r})=>'<li><a href="/run/'+encodeURIComponent(r.id)+'/dashboard">'+(r.passed?'PASS':'BLOCKED')+' · '+escapeHtml(r.suite.name)+'</a><br><small>'+escapeHtml(r.target.name)+' · '+escapeHtml(r.createdAt)+'</small></li>').join('')+'</ul>':'<p>No completed evaluations yet. Run <code>npm run citywheels:check</code> from the project checkout, then refresh.</p>')+(unreadable?'<p>'+unreadable+' unreadable artifacts skipped. Check the report files before relying on this run list.</p>':'')+'<p><a href="/runs">Refresh runs</a> · <a href="/demo">Open simulation laboratory</a></p></html>';
}

/** Focused renderer used by both the default server and saved project artifacts. */
export async function dashboardPage(directory: string, runId?: string) {
  const { runs, unreadable } = await savedReports(directory);
  const chosen = runId ? runs.find(r => r.report.id === runId) : runs[0];
  if (!chosen) return { status: runId ? 404 : 200, html: library(runs, unreadable) };
  const r = chosen.report;
  // Older reports did not retain case inputs. Never invent their questions or expectations.
  let suite: Suite = { schemaVersion: 1, name: r.suite.name, version: r.suite.version,
    cases: [...new Map(r.results.map(t => [t.caseId, { id: t.caseId, intent: t.intent, split: t.split,
      input: { question: 'Original input was not retained with this report.' }, assertions: [] }])).values()] };
  try { const retained = validateSuite(JSON.parse(await readFile(join(chosen.directory, 'suite.json'), 'utf8'))); if (hash(retained) === r.suite.hash) suite = retained; } catch { /* Legacy artifact: absence remains visible. */ }
  let baseline: RunReport | undefined;
  try { const comparison = JSON.parse(await readFile(join(chosen.directory, 'comparison.json'), 'utf8'));
    if (comparison.candidate === r.id) baseline = runs.find(run => run.report.id === comparison.baseline)?.report;
  } catch { /* Standalone evaluation without a comparison. */ }
  const html = renderProjectDashboard(r, suite, { baseline })
    .replace('href="report.html"', 'href="/run/'+encodeURIComponent(r.id)+'/report"')
    .replace('<nav aria-label="Evaluation views">', '<p class="caption"><a href="/runs">Change run / refresh</a> · <a href="/demo">Simulation laboratory</a></p><nav aria-label="Evaluation views">');
  return { status: 200, html };
}

export function dashboardHandler(directory: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    // Loopback binding alone does not prevent DNS rebinding.
    if (!/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/i.test(request.headers.host ?? '')) { response.writeHead(403); response.end('Use the localhost dashboard URL.'); return; }
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    try {
      const path = (request.url ?? '/').split('?')[0]!;
      if (path === '/demo') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(dashboardHtml); return; }
      if (path === '/api/reports') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await dashboardSnapshot(directory))); return; }
      if (path === '/runs') { const { runs, unreadable } = await savedReports(directory); response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(library(runs, unreadable)); return; }
      const match = /^\/run\/([^/]+)\/(dashboard|report)$/.exec(path);
      if (path === '/' || match) {
        const id = match ? decodeURIComponent(match[1]!) : undefined;
        if (match?.[2] === 'report') { const { runs } = await savedReports(directory); const run = runs.find(r => r.report.id === id); if (!run) { response.writeHead(404); response.end('Run not found.'); return; } response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(renderHtml(run.report)); return; }
        const page = await dashboardPage(directory, id); response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.writeHead(page.status); response.end(page.html); return;
      }
      response.writeHead(404); response.end('Not found');
    } catch {
      response.writeHead(503); response.end('Cannot read evaluation artifacts. Check the directory and report files, then refresh.');
    }
  };
}

export function startDashboard(directory: string, port = 4317) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('port must be an integer from 0 to 65535');
  const server = createServer(dashboardHandler(directory)); server.listen(port, '127.0.0.1'); return server;
}
