#!/usr/bin/env node
// Turn an AW ASK feedback export into an IntentGauge suite and replay file.
// Keeps the question, the recorded answer, and the sources. Drops emails, names,
// prompts, system instructions, and conversation snapshots.
// Chunk text is optional. Without it, source snippets stay previews.

import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function feedbackId(value) {
  if (value && typeof value === 'object' && typeof value.$oid === 'string') return value.$oid;
  return typeof value === 'string' ? value : '';
}

function tag(prefix, value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return clean ? `${prefix}-${clean}` : undefined;
}

function metadata(source, textCoverage) {
  const meta = { textCoverage };
  for (const key of ['relPath', 'sourceFile', 'contentHash', 'versionId']) {
    if (typeof source[key] === 'string' && source[key]) meta[key] = source[key];
  }
  for (const key of ['page', 'startSec', 'endSec', 'score']) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) meta[key] = source[key];
  }
  if (source.cell !== null && typeof source.cell === 'object') meta.cell = source.cell;
  return meta;
}

function documentFor(source, index, texts) {
  const chunkId = typeof source.chunkId === 'string' ? source.chunkId : '';
  const full = chunkId ? texts.get(chunkId) : undefined;
  const id = full ? chunkId : `nochunk-${index}`;
  const text = full || (typeof source.snippet === 'string' ? source.snippet : '');
  return {
    id,
    ...(text ? { text } : {}),
    metadata: metadata(source, full ? 'full' : 'preview'),
    quote: typeof source.quote === 'string' ? source.quote.trim() : '',
    cited: source.cited === true,
  };
}

/** @param {unknown[]} records @param {Map<string, string>} texts */
export function toReplay(records, texts) {
  const cases = [];
  const outputs = {};
  const seen = new Set();
  let skipped = 0;
  let cited = 0;
  let citedFull = 0;
  for (const row of records) {
    if (!row || typeof row !== 'object') { skipped += 1; continue; }
    const record = /** @type {Record<string, unknown>} */ (row);
    const question = typeof record.question === 'string' ? record.question : '';
    const answer = typeof record.answer === 'string' ? record.answer : '';
    if (!question.trim() || !Array.isArray(record.sources)) { skipped += 1; continue; }
    const id = feedbackId(record._id);
    if (!id || seen.has(id)) { skipped += 1; continue; }
    seen.add(id);
    const documents = record.sources.filter(source => source && typeof source === 'object').map((source, index) => documentFor(source, index, texts));
    const citedDocs = documents.filter(item => item.cited);
    cited += citedDocs.length;
    citedFull += citedDocs.filter(item => item.metadata.textCoverage === 'full').length;
    const textTag = citedDocs.length === 0 ? 'text-uncited'
      : citedDocs.every(item => item.metadata.textCoverage === 'full') ? 'text-full'
      : citedDocs.some(item => item.metadata.textCoverage === 'full') ? 'text-partial'
      : 'text-preview';
    const fix = record.fixReport && typeof record.fixReport === 'object' ? /** @type {Record<string, unknown>} */ (record.fixReport) : undefined;
    const tags = [tag('rating', record.rating), tag('status', record.status), tag('category', fix?.category), tag('author', fix?.userWasRight), textTag].filter(Boolean);
    const debug = record.debug && typeof record.debug === 'object' ? /** @type {Record<string, unknown>} */ (record.debug) : {};
    const data = { feedbackId: id, rating: record.rating, textCoverage: textTag };
    if (typeof record.foundInDocuments === 'boolean') data.foundInDocuments = record.foundInDocuments;
    if (typeof debug.model === 'string') data.model = debug.model;
    if (typeof debug.totalMs === 'number' && Number.isFinite(debug.totalMs)) data.recordedTotalMs = debug.totalMs;
    if (typeof fix?.userWasRight === 'string') data.authorAgrees = fix.userWasRight;
    const tokensIn = debug.tokensIn;
    const tokensOut = debug.tokensOut;
    const observation = {
      answer,
      ...(typeof record.foundInDocuments === 'boolean' ? { abstained: !record.foundInDocuments } : {}),
      ...(typeof tokensIn === 'number' && typeof tokensOut === 'number' && Number.isFinite(tokensIn) && Number.isFinite(tokensOut) ? { tokens: tokensIn + tokensOut } : {}),
      retrieved: documents.map(item => ({ id: item.id, ...(item.text ? { text: item.text } : {}), metadata: item.metadata })),
      citations: citedDocs.map(item => ({ sourceId: item.id, ...(item.quote ? { quote: item.quote } : {}), metadata: item.metadata })),
      data,
    };
    cases.push({
      id,
      intent: 'question',
      split: 'dev',
      tags,
      input: { question },
      assertions: [{ id: 'citations', type: 'citations', requireQuotes: true }],
    });
    outputs[id] = observation;
  }
  return {
    suite: { schemaVersion: 1, name: 'AW ASK feedback replay', version: '1', cases },
    outputs,
    notes: {
      cases: cases.length,
      skipped,
      cited,
      citedWithFullText: citedFull,
      split: 'dev',
      intent: 'question',
      check: 'literal citation provenance against full chunk text, or a preview error when only a snippet is available',
      withheld: ['userEmail', 'userName', 'prompt', 'systemInstruction', 'conversationSnapshot', 'comment'],
    },
  };
}

async function loadTexts(path) {
  const texts = new Map();
  if (!path) return texts;
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let pending = '';
  for await (const line of lines) {
    pending = pending ? `${pending}\n${line}` : line;
    if (!pending.trim()) { pending = ''; continue; }
    let row;
    try { row = JSON.parse(pending); }
    catch { continue; }
    pending = '';
    if (typeof row.id === 'string' && typeof row.text === 'string' && row.text) texts.set(row.id, row.text);
  }
  if (pending.trim()) throw new Error('Chunk text file ended inside a JSON record');
  return texts;
}

async function main() {
  const feedbackPath = argument('--feedback');
  const out = argument('--out');
  if (!feedbackPath || !out) {
    console.error('Usage: node scripts/feedback-replay.mjs --feedback FILE --out DIR [--chunks FILE.jsonl]');
    process.exitCode = 2;
    return;
  }
  const records = JSON.parse(await readFile(feedbackPath, 'utf8'));
  if (!Array.isArray(records)) throw new Error('Feedback file must be a JSON array');
  const built = toReplay(records, await loadTexts(argument('--chunks')));
  if (!built.suite.cases.length) throw new Error('No usable feedback rows');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'suite.json'), JSON.stringify(built.suite) + '\n', { mode: 0o600 });
  await writeFile(resolve(out, 'outputs.json'), JSON.stringify(built.outputs) + '\n', { mode: 0o600 });
  await writeFile(resolve(out, 'prepare.json'), JSON.stringify(built.notes, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(built.notes));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 2;
  });
}
