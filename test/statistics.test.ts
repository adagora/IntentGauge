import test from 'node:test';
import assert from 'node:assert/strict';
import { slice, summarize, checkGates, summarizeAndCheckGates, mistakeCost } from '../src/statistics.js';
import { referenceSlice, referenceSummarize, referenceCheckGates, referenceMistakeCost } from './fixtures/statistics-reference.js';
import type { CaseResult, Gate, Suite } from '../src/types.js';

const suite=(gates:Gate[]=[],mistakeCosts?:Suite['mistakeCosts']):Suite=>({schemaVersion:1,name:'statistics parity',version:'1',cases:[],gates,mistakeCosts});
const row=(caseId:string,intent:string,status:CaseResult['status']='pass',tags:string[]=[]):CaseResult=>({caseId,intent,status,tags,repetition:0,split:'test',latencyMs:1,checks:[],output:{intent,cost:.1}});
function compare(rows:CaseResult[],s:Suite) {
  const original=structuredClone(rows),expected=referenceSummarize(rows,s),actual=summarize(rows,s);
  assert.deepEqual(actual,expected);assert.equal(JSON.stringify(actual),JSON.stringify(expected),'property and floating-point output parity');
  assert.deepEqual(slice(rows),referenceSlice(rows));
  assert.deepEqual(mistakeCost(rows,s),referenceMistakeCost(rows,s));
  const gates=referenceCheckGates(expected,rows,s);
  assert.deepEqual(checkGates(actual,rows,s),gates);
  assert.deepEqual(summarizeAndCheckGates(rows,s),{summary:expected,gates});
  assert.deepEqual(rows,original,'input must remain unchanged');
  return actual;
}

test('aggregation preserves bitset boundaries, per-slice unique support and duplicated tag membership',()=>{
  compare([row('single','intent','error',Array.from({length:100},(_,i)=>'tag-'+i))],suite([{minCases:1},{intent:'absent',minPassRate:0}]));
  const rows:CaseResult[]=[];
  for(let i=0;i<100;i++) {
    const first=row('shared','intent-'+i,'pass',['tag-'+i,'shared','shared']);
    rows.push(first,{...first,status:i%3===0?'error':'pass',repetition:7,latencyMs:i});
  }
  rows.push(row('other','intent-31','fail',['tag-31']));
  const actual=compare(rows,suite([{minPassRateLowerBound:0},{intent:'intent-31',minCases:2},{intent:'absent',maxP95LatencyMs:1}]));
  assert.equal(actual.overall.cases,2);
  assert.equal(actual.byTag.shared!.trials,200);
  assert.equal(actual.byIntent['intent-31']!.cases,2);
  assert.equal(actual.byIntent['intent-32']!.cases,1);
});

test('aggregation preserves empty values, exact percentile, ordering, missing costs, zero scores and special names',()=>{
  compare([],suite([{minCases:0},{intent:'missing',maxMeanCost:0}]));
  const signedZero=row('one','intent');signedZero.output={intent:'other',cost:-0};signedZero.latencyMs=-0;
  compare([signedZero],suite([{maxMeanCost:0,maxMeanMistakeCost:0}],{intent:{other:-0}}));
  const names=['3','1','__proto__','constructor','toString','overall','a / b'];
  const rows=names.map((name,i)=>{const r=row(name,name,'pass',[name]);r.latencyMs=i; r.checks=[{id:name,status:'skip',severity:'critical',score:0,reason:'fixture'}];return r;});
  rows[0]!.output={intent:'predicted-only',cost:0};
  rows[1]!.output={};rows[2]!.status='error';delete rows[2]!.output;
  compare(rows,suite([{minPrecision:0,minRecall:0,maxMeanCost:1,maxMeanMistakeCost:1},{intent:'overall',maxCriticalFailures:0},{intent:'__proto__',maxErrorRate:1}],Object.fromEntries(names.map(n=>[n,{__missing__:3,__error__:7,'predicted-only':11}]))));
  const percentile=compare(Array.from({length:20},(_,i)=>({...row('case-'+i,'intent'),latencyMs:20-i})),suite([{maxP95LatencyMs:19}]));
  assert.equal(percentile.overall.p95LatencyMs,19);
});

test('standalone gates read current rows even if supplied summary slices are stale',()=>{
  const rows=[row('one','intent'),row('two','intent','fail')],s=suite([{intent:'intent',minPassRate:1,maxMeanMistakeCost:0},{minCases:2}]);
  const summary=summarize(rows,s);
  summary.byIntent.intent!.passRate=1;summary.overall.cases=999;
  rows[0]!.status='error';rows[0]!.output={};
  assert.deepEqual(checkGates(summary,rows,s),referenceCheckGates(summary,rows,s));
  assert.equal(checkGates(summary,rows,s)[0]!.passed,false);
});

test('aggregation and gates match the frozen baseline on randomized sparse checks, scopes and costs',()=>{
  let seed=0x634842;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const pick=<T>(values:T[]):T=>values[Math.floor(next()*values.length)]!;
  const names=['__proto__','constructor','overall','1','10','quoted"name','intent'];
  for(let trial=0;trial<400;trial++) {
    const rows:CaseResult[]=Array.from({length:Math.floor(next()*100)},(_,i)=>{
      const intent=pick(names),r=row('case-'+Math.floor(next()*30),intent,pick(['pass','fail','error']),Array.from({length:Math.floor(next()*4)},()=>pick(names)));
      r.repetition=i%5;r.latencyMs=Math.floor(next()*10000)/3;
      r.checks=Array.from({length:Math.floor(next()*8)},()=>({id:pick(names),status:pick(['pass','fail','error','skip']),severity:pick(['normal','critical']),reason:'fixture',...(next()<.6?{score:pick([0,.1,.3,.9,1])}:{})}));
      if(next()<.2)delete r.output;
      else r.output={...(next()<.8?{intent:pick([...names,'predicted-only'])}:{}),...(next()<.7?{cost:pick([0,.1,.2,.3,1])}:{})};
      return r;
    });
    const gates:Gate[]=Array.from({length:8},()=>({...(next()<.8?{intent:pick([...names,'absent'])}:{}),minCases:pick([0,1,10]),minPassRate:pick([0,.5,1]),minPassRateLowerBound:.1,minPrecision:.2,minRecall:.4,maxCriticalFailures:3,maxErrorRate:.5,maxP95LatencyMs:1000,maxMeanCost:1,maxMeanMistakeCost:2}));
    const prices=Object.fromEntries(names.map(name=>[name,Object.fromEntries([...names,'predicted-only','__missing__','__error__'].filter(()=>next()<.4).map(n=>[n,pick([0,.1,1,10])]))]));
    compare(rows,suite(gates,trial%3?prices:undefined));
  }
});
