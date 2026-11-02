import { readFile } from 'node:fs/promises';
import { hash } from './runner.js';
import { object, validateObservation } from './validation.js';
import type { Judge, Observation, Target } from './types.js';

export function replay(outputs: Record<string, Observation | Observation[]>, name = 'replay'): Target {
  object(outputs, 'replay outputs');
  for (const v of Object.values(outputs)) (Array.isArray(v) ? v : [v]).forEach(validateObservation);
  return { name, revision: hash(outputs), async execute({ id }, { repetition }) {
    const value = Object.hasOwn(outputs, id) ? outputs[id] : undefined;
    const output = Array.isArray(value) ? value[repetition] : value;
    if (!output) throw new Error(`No replay output for ${id}, repetition ${repetition}`);
    return structuredClone(output);
  } };
}
export async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')); }
export function endpoint(url: string): URL {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use http(s) endpoint without URL credentials');
  return parsed;
}
export async function postJson(url: string, body: unknown, signal: AbortSignal, token?: string): Promise<unknown> {
  const response = await fetch(endpoint(url), { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal, redirect: 'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
export function httpTarget(url: string, revision: string, token?: string): Target {
  endpoint(url);
  return { name: 'http', revision, async execute(request, context) { return validateObservation(await postJson(url, request, context.signal, token)); } };
}
/** Any judge service/provider can implement this normalized JSON endpoint. */
export function httpJudge(url: string, revision: string, token?: string): Judge {
  endpoint(url);
  return { name: 'http-judge', revision, async evaluate(request, context) {
    const verdict = await postJson(url, request, context.signal, token);
    object(verdict, 'judge verdict');
    return verdict as unknown as { score: number; reason: string };
  } };
}
