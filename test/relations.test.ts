import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRelations } from '../src/relations.js';
import { referenceApplyRelations } from './fixtures/relations-reference.js';
import type { CaseResult, Json, Relation } from '../src/types.js';

const row=(caseId:string,repetition:number,value:Json=1,status:CaseResult['status']='pass'):CaseResult=>({caseId,repetition,intent:'help',split:'test',tags:[],status,latencyMs:1,checks:[],output:{data:{value}}});
const relation=(source:string,target:string,id='stable'):Relation=>({id,source,target,path:'/data/value',type:'unchanged'});
function outcome(fn:typeof applyRelations,rows:CaseResult[],relations:Relation[]) {
  const copy=structuredClone(rows);let error:string|undefined;
  try{fn(copy,relations);}catch(caught){error=(caught as Error).message;}
  return {rows:copy,error};
}
function compare(rows:CaseResult[],relations:Relation[]) {
  const expected=outcome(referenceApplyRelations,rows,relations),actual=outcome(applyRelations,rows,relations);
  assert.deepEqual(actual,expected);return actual;
}

test('indexed relations pair shuffled sparse repetitions and preserve target traversal and check order',()=>{
  const rows=[row('target',1000000,3),row('source',7,2),row('target',0,1),row('source',1000000,3),row('target',7,2),row('source',0,1)];
  const relations=[relation('source','target','first'),{...relation('source','target','second'),type:'changed' as const}];
  const result=compare(rows,relations);
  assert.equal(result.error,undefined);
  for(const index of [0,2,4])assert.deepEqual(result.rows[index]!.checks.map(c=>[c.id,c.status]),[['first','pass'],['second','fail']]);
  assert.deepEqual(rows.map(r=>r.checks.length),[0,0,0,0,0,0]);
});

test('indexed relations retain last duplicate source and all duplicate targets',()=>{
  const result=compare([row('__proto__',7,1),row('target',7,2),row('__proto__',7,2),row('target',7,1)],[relation('__proto__','target')]);
  assert.equal(result.rows[1]!.checks[0]!.status,'pass');
  assert.equal(result.rows[3]!.checks[0]!.status,'fail');
});

test('indexed relation errors preserve partial mutations and unmatched target behavior',()=>{
  const rows=[row('target',0),row('source',0),row('target',9)];
  const result=compare(rows,[relation('source','target')]);
  assert.equal(result.error,'Missing paired case source, repetition 9');
  assert.equal(result.rows[0]!.checks.length,1);assert.equal(result.rows[2]!.checks.length,0);
  const reversed=compare([rows[2]!,rows[1]!,rows[0]!],[relation('source','target')]);
  assert.equal(reversed.rows[2]!.checks.length,0);
  assert.equal(compare(rows,[relation('absent','target')]).error,'Missing paired case absent, repetition 0');
  assert.equal(compare(rows,[relation('absent','absent-target')]).error,undefined);
  assert.deepEqual(compare([], [relation('a','b')]),{rows:[],error:undefined});
  assert.deepEqual(compare(rows,[]),{rows,error:undefined});
});

test('indexed relation chains retain prior error precedence and ordered evidence',()=>{
  const rows=[row('a',0,1),row('b',0,1),row('c',0,1)];
  delete rows[0]!.output;
  rows[1]!.status='error';
  const result=compare(rows,[relation('a','b','missing'),relation('c','b','pass'),{...relation('a','c','directional'),type:'nonIncreasing'}]);
  assert.equal(result.rows[1]!.status,'error');
  assert.deepEqual(result.rows[1]!.checks.map(c=>c.id),['missing','pass']);
  assert.equal(result.rows[2]!.checks[0]!.status,'fail');
});

test('indexed relations match the frozen reference on randomized graphs, orders and evidence',()=>{
  let seed=0x628af3;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const pick=<T>(values:T[]):T=>values[Math.floor(next()*values.length)]!;
  const values:Json[]=[null,false,1,2,1.01,'text',{nested:[1,2]}],types:Relation['type'][]=['unchanged','changed','nonIncreasing','nonDecreasing'];
  for(let trial=0;trial<400;trial++) {
    const ids=['__proto__','a|b','a','quoted"case','line\nbreak'].slice(0,2+Math.floor(next()*4)),rows:CaseResult[]=[];
    for(const id of ids)for(const repetition of [0,3,1000000])if(next()<.85) {
      const result=row(id,repetition,pick(values),pick(['pass','fail','error']));
      if(next()<.15)delete result.output;
      rows.push(result);if(next()<.15)rows.push(row(id,repetition,pick(values)));
    }
    for(let i=rows.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[rows[i],rows[j]]=[rows[j]!,rows[i]!];}
    const relations:Relation[]=Array.from({length:1+Math.floor(next()*20)},(_,i)=>({id:'rel-'+i,source:pick([...ids,'absent']),target:pick(ids),path:next()<.15?'/data/absent':'/data/value',type:pick(types),tolerance:pick([0,.1]),severity:pick(['normal','critical'])}));
    compare(rows,relations);
  }
});
