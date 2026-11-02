import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RunReport } from './types.js';
import { object, string } from './validation.js';

export function escapeHtml(value: unknown): string { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export function renderHtml(r: RunReport): string {
  const s = r.summary.overall;
  const slices = Object.entries(r.summary.byIntent).map(([intent, v]) => `<tr><td>${escapeHtml(intent)}</td><td>${v.cases}</td><td>${pct(v.passRate)}</td><td>${pct(v.passRateLowerBound)}</td><td>${v.criticalFailures}</td><td>${v.errors}</td></tr>`).join('');
  const gates = r.gates.map(g => `<tr><td>${g.passed ? 'PASS' : 'FAIL'}</td><td>${escapeHtml(g.scope)}</td><td>${escapeHtml(g.metric)}</td><td>${g.actual ?? 'unknown'}</td><td>${g.expected}</td></tr>`).join('');
  const cases = r.results.map(c => `<details data-status="${c.status}"><summary><strong class="${c.status}">${c.status.toUpperCase()}</strong> ${escapeHtml(c.caseId)} · ${escapeHtml(c.intent)} · trial ${c.repetition + 1} · ${Math.round(c.latencyMs)} ms</summary>${c.error ? `<p>${escapeHtml(c.error)}</p>` : ''}<ul>${c.checks.map(k => `<li><strong class="${k.status}">${k.status.toUpperCase()}</strong> ${escapeHtml(k.id)}${k.severity === 'critical' ? ' [critical]' : ''}: ${escapeHtml(k.reason)}${k.score === undefined ? '' : ` (${k.score.toFixed(3)})`}</li>`).join('')}</ul><pre>${escapeHtml(JSON.stringify(c.output ?? {}, null, 2))}</pre></details>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>evalLOL · ${escapeHtml(r.suite.name)}</title><style>
  :root{color-scheme:light;font-family:system-ui,sans-serif;color:#182c3c;background:#f4f6f8}body{max-width:1120px;margin:auto;padding:32px 20px}h1{font-size:36px;letter-spacing:-1px}h2{margin-top:32px}small,.muted{color:#526779}.cards{display:flex;gap:14px;flex-wrap:wrap}.card{background:white;border:1px solid #dbe3e9;border-radius:12px;padding:20px;flex:1;min-width:140px}.card strong{display:block;font-size:28px;margin-top:8px}.pass{color:#0c6548}.fail,.error{color:#a52b34}.skip{color:#796000}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #dbe3e9}th{font-size:13px;color:#526779}details{margin:10px 0;border:1px solid #dbe3e9;border-radius:8px;background:white;padding:16px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f4f6f8;padding:16px}li{margin:8px 0}input,select{padding:10px;border:1px solid #9badbb;border-radius:6px;font:inherit}input{width:min(400px,80%)}.scroll{overflow-x:auto}[hidden]{display:none}footer{margin-top:32px;font-size:12px;overflow-wrap:anywhere}</style></head><body>
  <small>evalLOL / evaluation evidence</small><h1>${escapeHtml(r.suite.name)}</h1><p><strong class="${r.passed ? 'pass' : 'fail'}">${r.passed ? 'GATES PASSED' : 'GATES FAILED'}</strong> · ${escapeHtml(r.target.name)} · ${escapeHtml(r.suite.version)}</p>
  <div class="cards"><div class="card">Passing trials<strong>${pct(s.passRate)}</strong></div><div class="card">Cases / trials<strong>${s.cases} / ${s.trials}</strong></div><div class="card">Critical failures<strong>${s.criticalFailures}</strong></div><div class="card">P95 target latency<strong>${Math.round(s.p95LatencyMs)} ms</strong></div></div>
  <p class="muted">95% Wilson lower bound: ${pct(s.passRateLowerBound)} (unique cases, every repeat must pass). Mean target cost: ${s.meanCost ?? 'unknown'}; coverage ${pct(s.costCoverage)}. Mean classification mistake cost: ${r.summary.mistakeCost.mean ?? 'unknown'}.</p>
  <h2>Intent coverage</h2><div class="scroll"><table><thead><tr><th>Intent</th><th>Cases</th><th>Pass rate</th><th>Lower bound</th><th>Critical</th><th>Errors</th></tr></thead><tbody>${slices}</tbody></table></div>
  <h2>Gates</h2>${gates ? `<div class="scroll"><table><thead><tr><th>Status</th><th>Scope</th><th>Metric</th><th>Observed</th><th>Threshold</th></tr></thead><tbody>${gates}</tbody></table></div>` : '<p>No explicit gates: every assertion must pass.</p>'}
  <h2>Metric scorecard</h2><div class="scroll"><table><thead><tr><th>Check</th><th>Pass / trials</th><th>Mean score</th><th>Score coverage</th><th>Errors / skipped</th></tr></thead><tbody>${Object.entries(r.summary.byCheck).map(([id, m]) => `<tr><td>${escapeHtml(id)}</td><td>${m.passed} / ${m.trials}</td><td>${m.meanScore === null ? 'unknown' : m.meanScore.toFixed(3)}</td><td>${pct(m.scoreCoverage)}</td><td>${m.errors} / ${m.skipped}</td></tr>`).join('')}</tbody></table></div>
  <h2>Intent classification</h2><pre>${escapeHtml(JSON.stringify({ confusion: r.summary.confusion, metrics: r.summary.classification }, null, 2))}</pre>
  <h2>Case evidence</h2><p><label>Search <input id="search" type="search" placeholder="Case, intent, assertion, evidence"></label> <label>Status <select id="status"><option value="">All</option><option>pass</option><option>fail</option><option>error</option></select></label></p><div id="cases">${cases}</div>
  <footer>Run ${escapeHtml(r.id)} · ${escapeHtml(r.createdAt)}<br>Suite SHA-256 ${escapeHtml(r.suite.hash)}<br>Target revision ${escapeHtml(r.target.revision)}${r.judge ? `<br>Judge ${escapeHtml(r.judge.name)} / ${escapeHtml(r.judge.revision)}` : ''}<p>Report contains target outputs. Review data before sharing. Passing gates is evaluation evidence, not a production approval.</p></footer>
  <script>const search=document.getElementById('search'),status=document.getElementById('status');function filter(){for(const row of document.querySelectorAll('#cases details'))row.hidden=!(row.textContent.toLowerCase().includes(search.value.toLowerCase())&&(!status.value||row.dataset.status===status.value));}search.addEventListener('input',filter);status.addEventListener('change',filter);</script></body></html>`;
}
export async function saveReport(report: RunReport, directory: string) {
  const dir = resolve(directory); await mkdir(dir, { recursive: true });
  // Exclusive writes prevent accidentally replacing an earlier run's evidence.
  await writeFile(resolve(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(resolve(dir, 'report.html'), renderHtml(report), { flag: 'wx', mode: 0o600 });
  return dir;
}
export function parseReport(value: unknown): RunReport {
  object(value, 'report'); object(value.suite, 'report.suite'); object(value.options, 'report.options');
  string(value.suite.hash, 'report suite hash');
  if (value.schemaVersion !== 1 || !Array.isArray(value.results) || !value.results.length) throw new Error('Invalid report');
  const seen = new Set();
  for (const row of value.results) {
    object(row, 'report result'); string(row.caseId, 'caseId');
    if (!Number.isSafeInteger(row.repetition) || (row.repetition as number) < 0 || !['pass', 'fail', 'error'].includes(String(row.status))) throw new Error('Invalid report result');
    const key = JSON.stringify([row.caseId, row.repetition]); if (seen.has(key)) throw new Error('Duplicate report result'); seen.add(key);
  }
  return value as unknown as RunReport;
}
export function compare(baseline: RunReport, candidate: RunReport) {
  parseReport(baseline); parseReport(candidate);
  if (baseline.suite.hash !== candidate.suite.hash || JSON.stringify(baseline.options) !== JSON.stringify(candidate.options) || JSON.stringify(baseline.judge) !== JSON.stringify(candidate.judge) || JSON.stringify(baseline.evaluators) !== JSON.stringify(candidate.evaluators)) throw new Error('Reports must use the same suite, run options, evaluator revisions, and judge revision');
  const key = (r: RunReport['results'][number]) => JSON.stringify([r.caseId, r.repetition]);
  const old = new Map(baseline.results.map(r => [key(r), r]));
  if (old.size !== candidate.results.length || candidate.results.some(r => !old.has(key(r)))) throw new Error('Reports have different case coverage');
  const regressions = candidate.results.filter(r => old.get(key(r))!.status === 'pass' && r.status !== 'pass').map(r => ({ caseId: r.caseId, repetition: r.repetition, status: r.status }));
  const improvements = candidate.results.filter(r => old.get(key(r))!.status !== 'pass' && r.status === 'pass').map(r => ({ caseId: r.caseId, repetition: r.repetition }));
  const checkRegressions = candidate.results.flatMap(r => {
    const prior = new Map(old.get(key(r))!.checks.map(c => [c.id, c]));
    return r.checks.filter(c => prior.get(c.id)?.status === 'pass' && c.status !== 'pass').map(c => ({ caseId: r.caseId, repetition: r.repetition, check: c.id, status: c.status }));
  });
  return { baseline: baseline.id, candidate: candidate.id, passed: regressions.length === 0 && checkRegressions.length === 0 && candidate.passed, regressions, checkRegressions, improvements };
}
