// Offline, measurement-only scenarios. Run after `npm run build`.
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, freemem, totalmem, release } from 'node:os';
import { createHash } from 'node:crypto';
import { summarize, checkGates } from '../dist/src/statistics.js';
import { calibrate } from '../dist/src/calibration.js';
import { applyRelations } from '../dist/src/relations.js';

const directory = process.argv[2] ?? 'artifacts/perf/data-oriented-baseline';
await mkdir(directory, { recursive: true });
const fingerprint = {
  timestamp: new Date().toISOString(), node: process.version, v8: process.versions.v8,
  platform: process.platform, architecture: process.arch, kernel: release(),
  cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemory: totalmem(), freeMemory: freemem(),
  build: 'tsc ES2022 / NodeNext; current installed Node', gitRevision: null,
  sourceHashes: Object.fromEntries(await Promise.all(['statistics','calibration','relations','runner'].map(async name=>[
    name, createHash('sha256').update(await readFile('src/'+name+'.ts')).digest('hex'),
  ]))),
  isolation: 'Shared developer host; no affinity, power or kernel changes; other workloads uncontrolled',
  cacheState: 'In-process V8 warmup (3 iterations); input objects resident; no application memoization',
  memoryLimitations: 'RSS/heap high-water include fixture creation and preceding scenarios; not isolated per-scenario peaks',
};
await writeFile(directory+'/fingerprint.json',JSON.stringify(fingerprint,null,2)+'\n');
const hash = value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scenarios=[];
for(const n of [100,1000,10000]) {
  const intents=32,checkCount=8;
  const rows=Array.from({length:n*2},(_,i)=>({caseId:'case-'+Math.floor(i/2),repetition:i%2,intent:'intent-'+(Math.floor(i/2)%intents),split:'test',tags:['tag-'+(Math.floor(i/2)%8)],status:i%19===0?'fail':'pass',latencyMs:i%503,checks:Array.from({length:checkCount},(_,c)=>({id:'check-'+c,status:i%19===0?'fail':'pass',severity:c===0?'critical':'normal',score:i%19===0?0:1,reason:'synthetic fixture'})),output:{intent:'intent-'+((Math.floor(i/2)+(i%17===0?1:0))%intents),cost:i%23===0?undefined:.001}}));
  const suite={schemaVersion:1,name:'synthetic aggregation',version:'1',cases:[],gates:Array.from({length:intents},(_,i)=>({intent:'intent-'+i,minCases:1,minPassRate:.9,maxMeanCost:.01}))};
  const summary=summarize(rows,suite),gates=checkGates(summary,rows,suite);
  scenarios.push({name:'summary-'+n,cases:n,trials:rows.length,checks:checkCount,fn:()=>summarize(rows,suite),golden:hash(summary)});
  scenarios.push({name:'gates-'+n,cases:n,trials:rows.length,gates:intents,fn:()=>checkGates(summary,rows,suite),golden:hash(gates)});
}
for(const n of [100,1000,10000]) {
  const data={schemaVersion:1,judge:{name:'synthetic',revision:'v1'},datasetVersion:'synthetic-v1',rows:Array.from({length:n},(_,i)=>({caseId:'case-'+i,intent:'one-intent',rubric:'policy',split:'holdout',humans:[{reviewer:'a',value:i%2===0},{reviewer:'b',value:i%2===0}],judge:i%2===0}))};
  scenarios.push({name:'calibration-skew-'+n,rows:n,groups:1,fn:()=>calibrate(data),golden:hash(calibrate(data))});
}
for(const n of [100,1000,5000]) {
  const rows=Array.from({length:n},(_,i)=>({caseId:'case-'+i,repetition:0,intent:'intent',split:'test',tags:[],status:'pass',latencyMs:1,checks:[],output:{data:{value:1}}}));
  const relations=Array.from({length:n/2},(_,i)=>({id:'relation-'+i,source:'case-'+i*2,target:'case-'+(i*2+1),path:'/data/value',type:'unchanged'}));
  let input;
  const prepare=()=>{input=rows.map(r=>({...r,checks:[]}));};prepare();
  const fn=()=>{applyRelations(input,relations);return input;};
  scenarios.push({name:'relations-'+n,trials:n,relations:relations.length,prepare,fn,golden:hash(fn())});
}
const measurements=[];
for(const scenario of scenarios) {
  for(let i=0;i<3;i++){scenario.prepare?.();scenario.fn();}
  const durations=[],cpuStart=process.cpuUsage(),wallStart=performance.now();
  for(let i=0;i<20;i++) {
    scenario.prepare?.();const begin=performance.now(),result=scenario.fn();durations.push(performance.now()-begin);
    if(hash(result)!==scenario.golden)throw new Error('Nondeterministic evidence: '+scenario.name);
  }
  const wallMs=performance.now()-wallStart,cpu=process.cpuUsage(cpuStart),memory=process.memoryUsage();
  const sorted=[...durations].sort((a,b)=>a-b),q=p=>sorted[Math.ceil(p*sorted.length)-1];
  const mean=durations.reduce((a,b)=>a+b)/durations.length;
  measurements.push({name:scenario.name,cases:scenario.cases,trials:scenario.trials,rows:scenario.rows,checks:scenario.checks,gates:scenario.gates,groups:scenario.groups,relations:scenario.relations,samples:20,warmups:3,durationsMs:durations,p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),p999Ms:q(.999),p9999Ms:q(.99999),maxMs:q(1),tailWarning:'At 20 samples p99 and higher are only the observed maximum, not reliable tail estimates',meanMs:mean,cv:Math.sqrt(durations.reduce((s,v)=>s+(v-mean)**2,0)/durations.length)/mean,operationsPerSecond:1000/mean,cpuUserUs:cpu.user,cpuSystemUs:cpu.system,cpuPercentIncludingVerification:100*(cpu.user+cpu.system)/(wallMs*1000),memory,processMaxRssKiB:process.resourceUsage().maxRSS,goldenSha256:scenario.golden,scope:'Timed function only; fixture preparation and golden digest outside timer. CPU/memory include verification. No target/LLM/network/HTML/I/O timing.'});
}
await writeFile(directory+'/baseline.json',JSON.stringify(measurements,null,2)+'\n');
const session=new Session();session.connect();
const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
await post('Profiler.enable');
const hotspots=[];
for(const name of ['summary-10000','gates-10000','calibration-skew-10000','relations-5000']) {
  const scenario=scenarios.find(s=>s.name===name);
  await post('Profiler.start');
  for(let i=0;i<20;i++){scenario.prepare?.();scenario.fn();}
  const {profile}=await post('Profiler.stop');
  await writeFile(directory+'/'+name+'.cpuprofile',JSON.stringify(profile)+'\n');
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();
  for(const node of profile.nodes)for(const child of node.children??[])parents.set(child,node.id);
  const inclusive=new Map();
  for(let i=0;i<(profile.samples??[]).length;i++) {
    let id=profile.samples[i];const delta=profile.timeDeltas?.[i]??0;
    while(id!==undefined){inclusive.set(id,(inclusive.get(id)??0)+delta);id=parents.get(id);}
  }
  const totalUs=(profile.timeDeltas??[]).reduce((a,b)=>a+b,0);
  const frames=[...inclusive].map(([id,microseconds])=>({frame:nodes.get(id).callFrame,microseconds,percent:100*microseconds/totalUs})).filter(x=>x.frame.url.includes('/dist/src/')).sort((a,b)=>b.microseconds-a.microseconds).slice(0,8);
  hotspots.push({scenario:name,samples:profile.samples?.length,totalUs,frames});
}
const allocations=[];
for(const name of ['summary-10000','calibration-skew-10000','relations-5000']) {
  const scenario=scenarios.find(s=>s.name===name);
  await post('HeapProfiler.startSampling',{samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  for(let i=0;i<10;i++){scenario.prepare?.();scenario.fn();}
  const {profile}=await post('HeapProfiler.stopSampling');
  await writeFile(directory+'/'+name+'.heapprofile',JSON.stringify(profile)+'\n');
  const entries=[];
  function visit(node){if(node.selfSize)entries.push({frame:node.callFrame,sampledBytes:node.selfSize});for(const child of node.children??[])visit(child);}
  visit(profile.head);entries.sort((a,b)=>b.sampledBytes-a.sampledBytes);
  allocations.push({scenario:name,iterations:10,samplingInterval:65536,totalSampledBytes:entries.reduce((sum,e)=>sum+e.sampledBytes,0),frames:entries.slice(0,10),warning:'Statistical allocation estimates including collected objects, not retained heap or isolated RSS. Relation fixture preparation included.'});
}
await writeFile(directory+'/allocations.json',JSON.stringify(allocations,null,2)+'\n');
session.disconnect();
await writeFile(directory+'/hotspots.json',JSON.stringify(hotspots,null,2)+'\n');
console.log(JSON.stringify(measurements.map(({name,p50Ms,p95Ms,cv})=>({name,p50Ms,p95Ms,cv})),null,2));
