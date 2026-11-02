// Same-process comparison against the frozen pre-rewrite implementation.
// Build first; output directory must differ from the original baseline directory.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { calibrate } from '../dist/src/calibration.js';
import { referenceCalibrate } from '../dist/test/fixtures/calibration-reference.js';

const directory=process.argv[2]??'artifacts/perf/data-oriented-calibration';
await mkdir(directory,{recursive:true});
const metrics=[];
for(const [name,n,groups,batch] of [['one-row',1,1,100],['small-26',26,1,20],['skew-1000',1000,1,1],['skew-10000',10000,1,1],['groups-32',10000,32,1],['groups-1000',10000,1000,1]]) {
  const input={schemaVersion:1,judge:{name:'synthetic',revision:'1'},datasetVersion:name,rows:Array.from({length:n},(_,i)=>({caseId:'case-'+i,intent:'intent-'+(i%groups),rubric:'policy',split:'holdout',humans:[{reviewer:'a',value:Math.floor(i/groups)%2===0},{reviewer:'b',value:Math.floor(i/groups)%2===0}],judge:Math.floor(i/groups)%2===0}))};
  assert.deepEqual(calibrate(input),referenceCalibrate(input));
  const implementations={before:referenceCalibrate,after:calibrate},samples={before:[],after:[]};
  for(let warm=0;warm<3;warm++)for(const fn of Object.values(implementations))for(let i=0;i<batch;i++)fn(input);
  for(let iteration=0;iteration<20;iteration++) {
    for(const version of iteration%2?['after','before']:['before','after']) {
      const fn=implementations[version];let result;
      const begin=performance.now();for(let i=0;i<batch;i++)result=fn(input);
      samples[version].push((performance.now()-begin)/batch);
      // Consume and verify outputs outside the timing window.
      assert.equal(result.slices.length,groups);
    }
  }
  const stats=Object.fromEntries(Object.entries(samples).map(([key,times])=>{const sorted=[...times].sort((a,b)=>a-b),mean=times.reduce((a,b)=>a+b,0)/times.length;return [key,{p50Ms:sorted[9],p95Ms:sorted[18],meanMs:mean,cv:Math.sqrt(times.reduce((sum,n)=>sum+(n-mean)**2,0)/times.length)/mean}];}));
  metrics.push({name,rows:n,groups,batch,samples,stats,medianSpeedup:stats.before.p50Ms/stats.after.p50Ms,p95Speedup:stats.before.p95Ms/stats.after.p95Ms});
}
const output={timestamp:new Date().toISOString(),node:process.version,method:'Same-process paired comparison, alternating order, 3 warmup batches and 20 measured batches. Per-call time; batching amortizes timer noise for tiny inputs. Fixture construction and output checks outside timer. Shared host, no forced GC, CPU affinity or power changes. 20 samples do not establish production tails. This measures local calibration, not inference.',metrics};
await writeFile(directory+'/paired-calibration.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(metrics.map(({name,stats,medianSpeedup})=>({name,beforeMedianMs:stats.before.p50Ms,afterMedianMs:stats.after.p50Ms,medianSpeedup})),null,2));
