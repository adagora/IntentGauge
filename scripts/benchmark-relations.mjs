// Build first. Compare complete relation application, including index construction.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { applyRelations } from '../dist/src/relations.js';
import { referenceApplyRelations } from '../dist/test/fixtures/relations-reference.js';
const directory=process.argv[2]??'artifacts/perf/data-oriented-relations';
await mkdir(directory,{recursive:true});
const metrics=[];
for(const [name,cases,repetitions,batch,relationLimit] of [['one-pair',2,[0],1000],['small-26',26,[0],200],['trials-1000',1000,[0],1],['trials-5000',5000,[0],1],['repeats-10',500,Array.from({length:10},(_,i)=>i),1],['sparse-repeats',1000,[0,7,1000000],1],['one-relation',5000,[0],1,1],['no-relations',5000,[0],1,0]]) {
  const rows=Array.from({length:cases},(_,i)=>repetitions.map(repetition=>({caseId:'case-'+i,repetition,intent:'intent',split:'test',tags:[],status:'pass',latencyMs:1,checks:[],output:{data:{value:Math.floor(i/2)+repetition}}}))).flat();
  // Deterministic permutation prevents an implementation from relying on run order.
  let seed=0x8123;for(let i=rows.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
  const relations=Array.from({length:relationLimit??cases/2},(_,i)=>({id:'relation-'+i,source:'case-'+i*2,target:'case-'+(i*2+1),path:'/data/value',type:'unchanged'}));
  const prepare=()=>rows.map(r=>({...r,checks:[]}));
  const expected=prepare(),actual=prepare();referenceApplyRelations(expected,relations);applyRelations(actual,relations);assert.deepEqual(actual,expected);
  const implementations={before:referenceApplyRelations,after:applyRelations},samples={before:[],after:[]};
  for(let warm=0;warm<3;warm++)for(const fn of Object.values(implementations))for(let i=0;i<batch;i++)fn(prepare(),relations);
  for(let iteration=0;iteration<20;iteration++)for(const version of iteration%2?['after','before']:['before','after']) {
    // Both versions receive fresh checks/status. Preparation is outside the timer.
    const inputs=Array.from({length:batch},prepare),fn=implementations[version];
    const begin=performance.now();for(const input of inputs)fn(input,relations);
    samples[version].push((performance.now()-begin)/batch);
    for(const input of inputs)assert.deepEqual(input,expected);
  }
  const stats=Object.fromEntries(Object.entries(samples).map(([key,times])=>{const sorted=[...times].sort((a,b)=>a-b),mean=times.reduce((a,b)=>a+b,0)/times.length;return [key,{p50Ms:sorted[9],p95Ms:sorted[18],meanMs:mean,cv:Math.sqrt(times.reduce((sum,n)=>sum+(n-mean)**2,0)/times.length)/mean}];}));
  metrics.push({name,cases,trials:rows.length,repetitions,relations:relations.length,batch,samples,stats,medianSpeedup:stats.before.p50Ms/stats.after.p50Ms,p95Speedup:stats.before.p95Ms/stats.after.p95Ms});
}
const sourceHashes=Object.fromEntries(await Promise.all(['src/relations.ts','src/evaluators.ts','test/fixtures/relations-reference.ts','scripts/benchmark-relations.mjs'].map(async name=>[name,createHash('sha256').update(await readFile(name)).digest('hex')])));
await writeFile(directory+'/paired-relations.json',JSON.stringify({timestamp:new Date().toISOString(),node:process.version,sourceHashes,method:'Shared host, same-process paired measurement, alternating order, 3 warmup and 20 measured batches. Includes index construction and check emission. Excludes input preparation and output verification. Tiny inputs batched. No forced GC, affinity or power changes. Synthetic local-kernel measurements; 20 samples do not establish production tails.',metrics},null,2)+'\n');
console.log(JSON.stringify(metrics.map(({name,stats,medianSpeedup})=>({name,beforeMedianMs:stats.before.p50Ms,afterMedianMs:stats.after.p50Ms,medianSpeedup})),null,2));
