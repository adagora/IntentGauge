// Build first. The before implementation is the frozen pre-rewrite source.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { summarize, checkGates, summarizeAndCheckGates } from '../dist/src/statistics.js';
import { referenceSummarize, referenceCheckGates } from '../dist/test/fixtures/statistics-reference.js';
const directory=process.argv[2]??'artifacts/perf/data-oriented-aggregation';
await mkdir(directory,{recursive:true});
const metrics=[];
for(const [name,cases,repetitions,intents,checks,tagCount,batch] of [['one-row',1,1,1,1,1,1000],['small-26',26,1,4,4,2,100],['medium',1000,2,32,8,8,1],['large',10000,2,32,8,8,1],['many-intents',4000,2,256,8,16,1],['many-checks',2000,2,32,64,8,1]]) {
  const rows=Array.from({length:cases*repetitions},(_,i)=>({caseId:'case-'+Math.floor(i/repetitions),repetition:i%repetitions,intent:'intent-'+(Math.floor(i/repetitions)%intents),split:'test',tags:['tag-'+(Math.floor(i/repetitions)%tagCount)],status:i%19===0?'fail':'pass',latencyMs:i%503,checks:Array.from({length:checks},(_,c)=>({id:'check-'+c,status:i%19===0?'fail':'pass',severity:c===0?'critical':'normal',score:i%19===0?0:1,reason:'synthetic'})),output:{intent:'intent-'+((Math.floor(i/repetitions)+(i%17===0?1:0))%intents),cost:i%23===0?undefined:.001}}));
  const suite={schemaVersion:1,name:'synthetic aggregation',version:'1',cases:[],gates:Array.from({length:intents},(_,i)=>({intent:'intent-'+i,minCases:1,minPassRate:.9,maxMeanCost:.01,maxMeanMistakeCost:1}))};
  const summary=referenceSummarize(rows,suite),gates=referenceCheckGates(summary,rows,suite);
  const phases={summary:{before:()=>referenceSummarize(rows,suite),after:()=>summarize(rows,suite),expected:summary},gates:{before:()=>referenceCheckGates(summary,rows,suite),after:()=>checkGates(summary,rows,suite),expected:gates},combined:{before:()=>{const summary=referenceSummarize(rows,suite);return {summary,gates:referenceCheckGates(summary,rows,suite)};},after:()=>summarizeAndCheckGates(rows,suite),expected:{summary,gates}}};
  for(const [phase,implementations] of Object.entries(phases)) {
    assert.deepEqual(implementations.after(),implementations.expected);
    for(let warm=0;warm<3;warm++)for(const version of ['before','after'])for(let i=0;i<batch;i++)implementations[version]();
    const samples={before:[],after:[]};
    for(let iteration=0;iteration<20;iteration++)for(const version of iteration%2?['after','before']:['before','after']) {
      let result;const begin=performance.now();for(let i=0;i<batch;i++)result=implementations[version]();
      samples[version].push((performance.now()-begin)/batch);
      assert.deepEqual(result,implementations.expected);
    }
    const stats=Object.fromEntries(Object.entries(samples).map(([key,times])=>{const sorted=[...times].sort((a,b)=>a-b),mean=times.reduce((a,b)=>a+b,0)/times.length;return [key,{p50Ms:sorted[9],p95Ms:sorted[18],meanMs:mean,cv:Math.sqrt(times.reduce((sum,n)=>sum+(n-mean)**2,0)/times.length)/mean}];}));
    metrics.push({name,phase,cases,trials:rows.length,intents,checks,tagCount,batch,samples,stats,medianSpeedup:stats.before.p50Ms/stats.after.p50Ms,p95Speedup:stats.before.p95Ms/stats.after.p95Ms});
  }
}
const sourceHashes=Object.fromEntries(await Promise.all(['src/statistics.ts','src/runner.ts','test/fixtures/statistics-reference.ts','scripts/benchmark-statistics.mjs'].map(async name=>[name,createHash('sha256').update(await readFile(name)).digest('hex')])));
await writeFile(directory+'/paired-statistics.json',JSON.stringify({timestamp:new Date().toISOString(),node:process.version,sourceHashes,method:'Same-process paired measurements with alternating order; 3 warmup and 20 measured batches. Fixture construction and complete output verification outside timers. Small inputs batched. Includes fresh accumulator/index construction and exact percentile sorting. No application caches, forced GC, affinity or power changes. Shared-host synthetic local kernels; 20 samples do not establish production tails.',metrics},null,2)+'\n');
console.log(JSON.stringify(metrics.map(({name,phase,stats,medianSpeedup})=>({name,phase,beforeMedianMs:stats.before.p50Ms,afterMedianMs:stats.after.p50Ms,medianSpeedup})),null,2));
