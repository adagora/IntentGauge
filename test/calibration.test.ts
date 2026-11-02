import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrate } from '../src/calibration.js';
import type { CalibrationRow } from '../src/calibration.js';
import { referenceCalibrate } from './fixtures/calibration-reference.js';

const dataset = (rows: CalibrationRow[]) => ({schemaVersion:1,judge:{name:'fixture',revision:'v1'},datasetVersion:'differential-v1',rows});

test('flat calibration counters preserve exhaustive label combinations and group/evidence order',()=>{
  const rows:CalibrationRow[]=[];
  for(const a of [false,true])for(const b of [false,true])for(const judge of [false,true])for(const adjudication of [undefined,false,true]) {
    rows.push({caseId:'case-'+rows.length,intent:rows.length%2?'a / b':'a',rubric:rows.length%2?'c':'b / c',split:'holdout',
      humans:[{reviewer:'alice',value:a},{reviewer:'bob',value:b}],judge,
      ...(adjudication===undefined?{}:{adjudication:{reviewer:'carol',value:adjudication}})});
  }
  for(const floor of [0,.5,.8,1])for(const minCases of [1,12,100]) {
    const input=dataset(rows),before=structuredClone(input);
    assert.deepEqual(calibrate(input,minCases,floor),referenceCalibrate(input,minCases,floor));
    assert.deepEqual(input,before);
    assert.equal(calibrate(input,minCases,floor).judge,input.judge);
  }
});

test('flat calibration matches the frozen baseline across randomized skew, rare groups and thresholds',()=>{
  let seed=0x7342a19;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const names=['__proto__','constructor','quoted"name','a\nb','a / b','a'];
  for(let trial=0;trial<300;trial++) {
    const count=1+Math.floor(next()*120),rows:CalibrationRow[]=[];
    for(let i=0;i<count;i++) {
      const a=next()<.5,b=next()<.5,adjudicate=next()<.65;
      rows.push({caseId:'case-'+i,intent:trial%3===0?'skew':names[Math.floor(next()*names.length)]!,rubric:names[Math.floor(next()*names.length)]!,split:'holdout',
        humans:[{reviewer:'alice',value:a},{reviewer:'bob',value:b}],judge:next()<.5,
        ...(adjudicate?{adjudication:{reviewer:'carol',value:next()<.5}}:{})});
    }
    const input=dataset(rows),minCases=1+Math.floor(next()*50),floor=[0,.5,.8,1][Math.floor(next()*4)]!;
    assert.deepEqual(calibrate(input,minCases,floor),referenceCalibrate(input,minCases,floor),'dataset '+trial);
  }
});

test('flat calibration preserves unresolved/degenerate cases and validation failures',()=>{
  const row:CalibrationRow={caseId:'__proto__',intent:'help',rubric:'policy',split:'holdout',humans:[{reviewer:'a',value:true},{reviewer:'b',value:false}],judge:true};
  for(const rows of [[row],[{...row,humans:[{reviewer:'a',value:true},{reviewer:'b',value:true}]} as CalibrationRow]]) {
    assert.deepEqual(calibrate(dataset(rows),1),referenceCalibrate(dataset(rows),1));
  }
  const valid=dataset([row]);
  const invalid:unknown[]=[null,{},dataset([]),{...valid,schemaVersion:2},dataset([row,row]),dataset([{...row,intent:''}]),
    dataset([{...row,split:'dev'} as unknown as CalibrationRow]),
    dataset([{...row,humans:[row.humans[0],row.humans[0]]}]),
    dataset([{...row,adjudication:{reviewer:'a',value:true}}])];
  const failure=(fn:()=>unknown)=>{try{fn();}catch(error){return (error as Error).message;}assert.fail('expected rejection');};
  for(const input of invalid)assert.equal(failure(()=>calibrate(input)),failure(()=>referenceCalibrate(input)));
  for(const [minCases,floor] of [[0,.8],[1.5,.8],[30,-1],[30,NaN]]) {
    assert.equal(failure(()=>calibrate(valid,minCases,floor)),failure(()=>referenceCalibrate(valid,minCases,floor)));
  }
});
