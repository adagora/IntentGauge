import { endpoint } from './adapters.js';
import { hash } from './runner.js';
import { json, object, string } from './validation.js';
import type { Json, Observation, Target } from './types.js';

/** Reads to EOF: the production protocol can emit verification AFTER final. */
export async function readChatStream(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`Chatbot HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Expected chatbot SSE response');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', total = 0;
  let final: Record<string, unknown> | undefined, verification: unknown;
  function event(block: string) {
    const lines = block.split(/\r?\n/);
    const name = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (name === 'error') throw new Error('Chatbot stream reported an error');
    if (name === 'final') { const value: unknown = JSON.parse(data); object(value, 'final event'); final = value; }
    if (name === 'verification') verification = JSON.parse(data);
  }
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) { buffer += decoder.decode(); break; }
      total += chunk.value.byteLength;
      if (total > 10 * 1024 * 1024) throw new Error('Chatbot stream exceeds 10 MiB');
      buffer += decoder.decode(chunk.value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length);
      }
    }
    if (buffer.trim()) event(buffer);
    if (!final) throw new Error('Chatbot stream ended without final event');
    return { ...final, ...(verification === undefined ? {} : { verification }) };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function normalizeChatbot(final: Record<string, unknown>): Observation {
  if (typeof final.answer !== 'string' || !Array.isArray(final.sources)) throw new Error('Chatbot final requires answer and sources');
  const sources = final.sources.map((source: unknown) => {
    object(source, 'source');
    if (!source.chunkId) string(source.relPath, 'source.relPath for document-level evidence');
    else string(source.chunkId, 'source.chunkId');
    const metadata: Record<string, Json> = { textCoverage: 'preview' };
    for (const key of ['index', 'relPath', 'page', 'startSec', 'endSec', 'versionId', 'contentHash', 'cell']) if (source[key] !== undefined) { json(source[key], `source.${key}`); metadata[key] = source[key]; }
    if (source.snippet !== undefined && typeof source.snippet !== 'string') throw new Error('source.snippet must be string');
    if (source.quote !== undefined && typeof source.quote !== 'string') throw new Error('source.quote must be string');
    const id = source.chunkId as string || `document:${hash(metadata)}`;
    return { id, text: source.snippet as string | undefined, metadata, quote: source.quote as string | undefined, cited: source.cited === true };
  });
  const data: Record<string, Json> = {};
  for (const key of ['model', 'primarySource', 'verification']) if (final[key] !== undefined) { json(final[key], key); data[key] = final[key]; }
  return {
    answer: final.answer,
    ...(typeof final.foundInDocuments === 'boolean' ? { abstained: !final.foundInDocuments } : {}),
    retrieved: sources.map(s => ({ id: s.id, ...(s.text === undefined ? {} : { text: s.text }), metadata: s.metadata })),
    citations: sources.filter(s => s.cited).map(s => ({ sourceId: s.id, ...(s.quote === undefined ? {} : { quote: s.quote }), metadata: s.metadata })),
    data,
  };
}
/** Explicit opt-in; POST /api/chat writes conversations and may incur model costs. */
export function chatbotTarget(url: string, revision: string, authorization?: string): Target {
  endpoint(url);
  return { name: 'chatbot-sse', revision, async execute(request, context) {
    object(request.input, 'chatbot input');
    const input = request.input;
    const questions = input.turns ?? [input.question];
    if (!Array.isArray(questions) || !questions.length) throw new Error('chatbot input needs question or nonempty turns');
    questions.forEach(q => string(q, 'question'));
    let conversationId: string | undefined;
    const turns: Observation[] = [];
    for (const question of questions) {
      const response = await fetch(endpoint(url), {
        method: 'POST', redirect: 'error', signal: context.signal,
        headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
        body: JSON.stringify({ question, ...(conversationId ? { conversationId } : {}), source: 'evallol', ...(typeof input.jev === 'boolean' ? { jev: input.jev } : {}) }),
      });
      const final = await readChatStream(response);
      if (questions.length > 1) { string(final.conversationId, 'conversationId for multi-turn case'); conversationId = final.conversationId; }
      turns.push(normalizeChatbot(final));
    }
    const last = turns.at(-1)!;
    // Serialize to remove optional undefined fields; raw prompts/debug never enter the report.
    return { ...last, data: { ...(last.data as Record<string, Json>), turns: JSON.parse(JSON.stringify(turns)) as Json } };
  } };
}
