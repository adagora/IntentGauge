import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { dashboardSnapshot } from '../src/dashboard.js';
import { renderProjectDashboard } from '../src/dashboard-project.js';
import { dashboardHtml } from '../src/dashboard-ui.js';
import { run } from '../src/runner.js';
import { saveReport } from '../src/reports.js';

test('dashboard discovers new reports, skips partial artifacts, and excludes raw case evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evallol-dashboard-'));
  assert.equal((await dashboardSnapshot(root)).reports.length, 0);
  const report = await run({schemaVersion:1,name:'test',version:'1',cases:[{id:'a',intent:'test',split:'test',input:'private input',assertions:[{id:'answer',type:'equals',value:'private answer'}]}]}, {name:'target',revision:'v1',async execute(){return {answer:'private answer',intent:'test'};}});
  await saveReport(report, join(root,'new-run'));
  await mkdir(join(root,'partial')); await writeFile(join(root,'partial/report.json'), '{');
  const snapshot = await dashboardSnapshot(root);
  assert.equal(snapshot.reports.length,1); assert.equal(snapshot.unreadable,1);
  assert.equal(snapshot.reports[0]!.id,report.id);
  assert.equal(snapshot.reports[0]!.trials[0]!.checks[0]!.status,'pass');
  assert.equal('reason' in snapshot.reports[0]!.trials[0]!.checks[0]!,false);
  assert.equal(JSON.stringify(snapshot).includes('private answer'),false);
  assert.equal(JSON.stringify(snapshot).includes('private input'),false);
  await assert.rejects(()=>dashboardSnapshot(join(root,'missing')));
});

test('dashboard controls recalculate simulation metrics, zero denominators, gates and incoming cases', () => {
  const elements = new Map<string, Record<string, any>>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',value:id==='scenario'?'baseline':'',checked:true,children:[],style:{setProperty(){}},setAttribute(){},replaceChildren(){this.innerHTML='';},prepend(x: unknown){this.children.unshift(x);}});
    return elements.get(id)!;
  };
  const source=dashboardHtml.split('<script>')[1]!.split('</script>')[0]!;
  const context={document:{hidden:false,getElementById:get,addEventListener(){},createElement(){return {textContent:''};}},structuredClone,Intl,console,setInterval:()=>1,clearInterval(){},fetch:()=>Promise.reject(new Error('offline'))};
  runInNewContext(source+`
    if(model().metrics['Flight status'].precision !== 470/510) throw Error('precision denominator');
    if(model().metrics['Special assistance'].recall !== 44/50) throw Error('recall denominator');
    if(!document.getElementById('cards').innerHTML.includes('158,562')) throw Error('error costs');
    selected=3;thresholds[3]=[0,0];render();
    if(!simPass(3,model().metrics[names[3]])) throw Error('gates did not update');
    const originalLoss=counts.reduce((a,row,i)=>a+row.reduce((b,n,j)=>b+n*costs[i][j],0),0);
    document.getElementById('inject').onclick();
    const faultLoss=counts.reduce((a,row,i)=>a+row.reduce((b,n,j)=>b+n*costs[i][j],0),0);
    if(faultLoss-originalLoss!==25000) throw Error('fault cost did not propagate');
    if(!document.getElementById('station-evidence').innerHTML.includes('classification mismatch')) throw Error('fault missing from station');
    const beforeReplay=JSON.stringify(counts);
    document.getElementById('trace-replay').onclick();
    if(tracePosition!==0||!traceTimer) throw Error('replay did not start');
    document.getElementById('trace-position').oninput({target:{value:'3'}});
    if(tracePosition!==3||traceTimer!==null||JSON.stringify(counts)!==beforeReplay) throw Error('replay changed evaluation');
    document.getElementById('reset').onclick();
    if(lastCase!==null||simulatedSequence!==0) throw Error('reset retained stale case');
    const before=counts.flat().reduce((a,b)=>a+b,0);addCase();
    if(counts.flat().reduce((a,b)=>a+b,0)!==before+1) throw Error('incoming case');
    counts=names.map(()=>[0,0,0,0]);render();
    if(model().metrics[names[0]].precision!==null) throw Error('zero denominator');
    if(document.getElementById('metrics').innerHTML.includes('NaN')) throw Error('NaN rendered');
  `,context);
});

test('watched dashboard follows new reports and preserves a manually pinned run', async () => {
  const report = await run({schemaVersion:1,name:'watch',version:'1',cases:[{id:'a',intent:'pricing',split:'test',input:null,assertions:[{id:'ok',type:'equals',value:'ok'}]}]}, {name:'classifier',revision:'v1',async execute(){return {answer:'ok',intent:'pricing'};}});
  const elements = new Map<string, Record<string, any>>();
  const get = (id: string) => {
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',checked:true,children:[],style:{setProperty(){}},setAttribute(){},replaceChildren(){this.innerHTML='';}});
    return elements.get(id)!;
  };
  let response = {reports:[report],unreadable:0};
  const context={document:{hidden:false,getElementById:get,addEventListener(){}},structuredClone,Intl,console,setInterval:()=>1,clearInterval(){},fetch:async()=>({ok:true,json:async()=>response})};
  const source=dashboardHtml.split('<script>')[1]!.split('</script>')[0]!;
  await runInNewContext(source+`;mode='reports';refresh();`,context);
  assert.match(String(get('policy').innerHTML),/pricing/);
  assert.match(String(get('line-disclaimer').textContent),/No synthetic movement/);
  assert.equal(get('packet').hidden,true);
  assert.match(String(get('stations').innerHTML),/HOLD/);
  assert.match(String(get('detail').innerHTML),/Not recorded/);
  const newer={...report,id:'newer-run',target:{name:'classifier',revision:'v2'}};
  response={reports:[newer,report],unreadable:0};
  await runInNewContext('refresh()',context);
  assert.match(String(get('policy').innerHTML),/v2/);
  get('run').value=report.id;get('run').onchange({target:{value:report.id}});
  assert.equal(get('follow').checked,false);
  response={reports:[{...newer,id:'third-run'},newer,report],unreadable:0};
  await runInNewContext('refresh()',context);
  assert.match(String(get('policy').innerHTML),/v1/);
});


test('project dashboard binds executed evidence, escapes source text, and does not infer classification', async () => {
  const suite = {schemaVersion:1 as const,name:'CityWheels project',version:'1',cases:[{id:'cancel-cw-1002',intent:'refund_confirmed',split:'test' as const,input:{question:'Refund CW-1002?'},assertions:[{id:'amount',type:'contains' as const,value:'340 EUR'}]}]};
  const report = await run(suite,{name:'offline fake provider',revision:'test',async execute(){return {answer:'340 EUR </script><script>bad()</script> $&'};}});
  const html=renderProjectDashboard(report,suite);
  assert.equal(html.includes('340 EUR </script><script>bad()'),false);
  assert.match(html,/Evals: Scoring Humans/);
  assert.match(html,/Evals: Confusion Matrix/);
  assert.match(html,/Refund CW-1002/);
  const elements=new Map<string,Record<string,any>>();
  const get=(id:string)=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:id==='min-cases'?'30':id==='min-agreement'?'0.8':'',checked:false,children:[],style:{setProperty(){}},setAttribute(){},replaceChildren(){this.innerHTML='';}});return elements.get(id)!;};
  let requests=0;
  const context={document:{hidden:false,getElementById:get,addEventListener(){}},structuredClone,Intl,console,setInterval:()=>1,clearInterval(){},fetch:async()=>{requests++;throw new Error('should not poll');}};
  const source=html.split('<script>')[1]!.split('</script>')[0]!;
  runInNewContext(source,context);
  assert.equal(requests,0);
  assert.equal(get('view-overview').hidden,false);
  assert.equal(get('view-humans').hidden,true);
  assert.equal(get('view-classification').hidden,true);
  assert.match(String(get('classification-body').innerHTML),/No intent predictions recorded/);
  assert.match(String(get('case-list').innerHTML),/340 EUR/);
  assert.match(String(get('case-list').innerHTML),/&lt;script&gt;/);
  assert.match(String(get('case-list').innerHTML),/\$&/);
  runInNewContext("showView('humans')",context);
  assert.equal(get('view-humans').hidden,false);
  assert.equal(get('view-overview').hidden,true);
  const calibration=JSON.parse(await readFile('examples/calibration.json','utf8'));
  runInNewContext('loadCalibration('+JSON.stringify(calibration)+')',context);
  assert.equal(get('human-empty').hidden,true);
  assert.match(String(get('human-results').innerHTML),/Human κ/);
  assert.match(String(get('human-results').innerHTML),/1\.000/);
  runInNewContext("if(agreement([true,true,false,false],[true,false,true,false]).kappa!==0)throw Error('chance kappa');if(agreement([true,true],[true,true]).kappa!==null)throw Error('degenerate kappa');loadCalibration({});",context);
  assert.notEqual(get('calibration-error').textContent,'');
  assert.equal(get('human-results').innerHTML,'');
});

async function projectHarness() {
  const suite = {schemaVersion:1 as const,name:'UX verification',version:'1',cases:[
    {id:'pass',intent:'help',split:'test' as const,input:{question:'Question </script> & <policy>?'},assertions:[{id:'answer',type:'equals' as const,value:'yes'}]},
    {id:'fail',intent:'help',split:'test' as const,input:{question:'Another question'},assertions:[{id:'answer',type:'equals' as const,value:'yes'}]},
  ]};
  const report=await run(suite,{name:'offline test',revision:'1',async execute(c){return {answer:c.id==='pass'?'yes':'no'};}});
  const elements=new Map<string,Record<string,any>>(),focused:string[]=[],listeners:Record<string,()=>void>={};
  const get=(id:string)=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:id==='min-cases'?'30':id==='min-agreement'?'0.8':'',checked:false,setAttribute(){},focus(){focused.push(id);},querySelector(){return {setAttribute(){},focus(){focused.push(id);}};},querySelectorAll(){return [];}});return elements.get(id)!;};
  const location={hash:''},history={pushState(_a:unknown,_b:unknown,hash:string){location.hash=hash;}};
  const context={document:{getElementById:get,addEventListener(){}},window:{addEventListener(name:string,fn:()=>void){listeners[name]=fn;}},location,history,Intl};
  const {createContext,runInContext}=await import('node:vm');const vm=createContext(context);
  const evaluate=(source:string)=>runInContext(source,vm);
  evaluate(renderProjectDashboard(report,suite).split('<script>')[1]!.split('</script>')[0]!);
  return {get,evaluate,report,suite,focused,location,listeners};
}

test('calibration reflects edits, names blockers, clears canceled reads, and rejects stale selections',async()=>{
  const {get,evaluate}=await projectHarness();
  const fixture=JSON.parse(await readFile('examples/calibration.json','utf8'));
  evaluate('loadCalibration('+JSON.stringify(fixture)+')');
  assert.match(get('overview-cards').innerHTML,/Loaded/);
  assert.match(get('overview-cards').innerHTML,/not linked to run/);
  get('min-cases').value='100';get('min-cases').oninput();
  assert.match(get('human-results').innerHTML,/Not eligible/);
  assert.match(get('human-results').innerHTML,/Need 70 more cases/);
  get('min-cases').value='';get('min-cases').oninput();
  assert.equal(get('human-results').innerHTML,'');
  assert.match(get('calibration-status').textContent,/No current eligibility/);
  get('min-cases').value='30';
  let finish!:(value:string)=>void;
  const slow=get('calibration-file').onchange({target:{files:[{name:'old.json',size:100,text:()=>new Promise<string>(resolve=>finish=resolve)}]}});
  await get('calibration-file').onchange({target:{files:[{name:'new.json',size:100,text:async()=>JSON.stringify({...fixture,datasetVersion:'new-selection'})}]}});
  finish(JSON.stringify({...fixture,datasetVersion:'stale-selection'}));await slow;
  assert.match(get('human-results').innerHTML,/new-selection/);
  assert.doesNotMatch(get('human-results').innerHTML,/stale-selection/);
  const pending=get('calibration-file').onchange({target:{files:[{name:'cancel.json',size:100,text:()=>new Promise<string>(resolve=>finish=resolve)}]}});
  await get('calibration-file').onchange({target:{files:[]}});
  finish(JSON.stringify(fixture));await pending;
  assert.equal(get('human-results').innerHTML,'');
  assert.match(get('overview-cards').innerHTML,/Missing/);
  const unresolved=structuredClone(fixture);unresolved.rows[0].humans[1].value=!unresolved.rows[0].humans[0].value;delete unresolved.rows[0].adjudication;
  evaluate('loadCalibration('+JSON.stringify(unresolved)+')');
  assert.match(get('human-results').innerHTML,/Adjudicate:/);
  assert.match(get('human-results').innerHTML,/Inspect 1 unresolved labels/);
  assert.ok(get('human-results').innerHTML.includes(unresolved.rows[0].caseId));
  const positive=structuredClone(fixture);for(const row of positive.rows){row.humans.forEach((h:any)=>h.value=true);row.judge=true;delete row.adjudication;}
  evaluate('loadCalibration('+JSON.stringify(positive)+')');
  assert.match(get('human-results').innerHTML,/No negative gold labels/);
});

test('review packets preserve source text and require matching independent labels and adjudication',async()=>{
  const {get,evaluate}=await projectHarness();
  for(const [id,value] of Object.entries({'review-version':'dev-v1','review-rubric':'refund','review-question':'Follows <policy>?','reviewer-a':'alice','reviewer-b':'bob'}))get(id).value=value;
  const packet=evaluate("reviewerPacket('a')"),html=evaluate("reviewerPage(reviewerPacket('a'))");
  assert.equal((html.match(/<script>/g)||[]).length,1);
  const script=html.split('<script>')[1].split('</script>')[0];
  const packetElements=new Map<string,any>();
  const doc={getElementById(id:string){if(!packetElements.has(id))packetElements.set(id,{innerHTML:'',textContent:'',value:'yes'});return packetElements.get(id);}};
  const captured=runInNewContext(script+';packet', {document:doc});
  assert.equal(captured.rows[0].question,'Question </script> & <policy>?');
  assert.equal(captured.rubric.text,'Follows <policy>?');
  assert.equal('checks' in captured.rows[0],false);
  assert.equal('humans' in captured.rows[0],false);
  const labels=(role:string,values:boolean[])=>({...evaluate('reviewerPacket('+JSON.stringify(role)+')'),schema:'evallol-review-labels-1',rows:packet.rows.map((r:any,i:number)=>({caseId:r.caseId,value:values[i]}))});
  const accept=(role:string,data:unknown)=>evaluate('acceptReview('+JSON.stringify(role)+','+JSON.stringify(data)+')');
  assert.throws(()=>accept('b',labels('a',[true,true])),/assigned reviewer/);
  const duplicate=labels('a',[true,true]);duplicate.rows[1].caseId=duplicate.rows[0].caseId;
  assert.throws(()=>accept('a',duplicate),/duplicate/);
  accept('a',labels('a',[true,false]));accept('b',labels('b',[false,false]));
  assert.match(get('review-progress').textContent,/1 disagreements/);
  get('adjudicator').value='alice';assert.throws(()=>evaluate('reviewedDataset()'),/third/);
  get('adjudicator').value='carol';assert.throws(()=>evaluate('reviewedDataset()'),/Resolve every disagreement/);
  evaluate("adjudications.pass=false");
  const result=evaluate('reviewedDataset()');assert.equal(result.rows[0].gold,false);assert.equal(result.rows[0].adjudication.reviewer,'carol');
  assert.equal(result.rows[0].split,'dev');assert.equal('judge' in result.rows[0],false);
  get('review-question').oninput();assert.throws(()=>evaluate('reviewedDataset()'),/Load both/);assert.equal(get('review-export').disabled,true);
});

test('comparison shows changes and persistent failures, rejects incompatible reports, and views restore history focus',async()=>{
  const {get,evaluate,report,focused,location,listeners}=await projectHarness();
  assert.equal(focused.length,0);
  evaluate("showView('humans')");assert.equal(location.hash,'#humans');assert.deepEqual(focused,['view-humans']);
  location.hash='#cases';listeners.popstate!();assert.equal(get('view-cases').hidden,false);assert.equal(focused.at(-1),'view-cases');
  location.hash='';listeners.popstate!();assert.equal(location.hash,'');assert.equal(get('view-overview').hidden,false);
  evaluate("showView('humans')");location.hash='#main';listeners.popstate!();assert.equal(get('view-humans').hidden,false);
  evaluate('loadComparison('+JSON.stringify(report)+')');
  assert.match(get('comparison-result').innerHTML,/Still failing trials \(1\)/);
  assert.match(get('comparison-result').innerHTML,/data-case="fail"/);
  const baseline=structuredClone(report);baseline.results[0]!.status='fail';baseline.results[1]!.status='pass';
  evaluate('loadComparison('+JSON.stringify(baseline)+')');
  assert.match(get('comparison-result').innerHTML,/New failing trials \(1\)/);
  assert.match(get('comparison-result').innerHTML,/Recovered trials \(1\)/);
  baseline.suite.hash='incompatible';evaluate('loadComparison('+JSON.stringify(baseline)+')');
  assert.equal(get('comparison-result').innerHTML,'');assert.match(get('comparison-error').textContent,/same suite/);
});

test('default dashboard serves focused evidence, a run library and an explicit simulation route',async()=>{
  const {dashboardPage,dashboardHandler}=await import('../src/dashboard.js');
  const {report,suite}=await projectHarness();const root=await mkdtemp(join(tmpdir(),'evallol-focused-'));
  assert.match((await dashboardPage(root)).html,/No completed evaluations/);
  const directory=join(root,'one');await saveReport(report,directory);await writeFile(join(directory,'suite.json'),JSON.stringify(suite));
  const page=await dashboardPage(root);assert.equal(page.status,200);assert.match(page.html,/SAVED RUN/);assert.match(page.html,/Change run/);assert.match(page.html,/Question/);
  assert.equal((await dashboardPage(root,'missing')).status,404);
  const handler=dashboardHandler(root);
  async function request(url:string,host='127.0.0.1:4317') {let body='',status=200;await handler({url,method:'GET',headers:{host}} as any,{setHeader(){},writeHead(code:number){status=code;},end(text=''){body=text;}} as any);return {body,status};}
  assert.match((await request('/')).body,/SAVED RUN/);
  assert.match((await request('/runs')).body,/Saved evaluations/);
  assert.match((await request('/demo')).body,/EVALUATION \/ OPERATOR CONSOLE/);
  assert.match((await request('/run/'+report.id+'/report')).body,/Case evidence/);
  assert.equal((await request('/','evil.example')).status,403);
});

test('reviewer exports round-trip through file imports and adjudicated evidence export',async()=>{
  const {get,evaluate}=await projectHarness();
  for(const [id,value] of Object.entries({'review-version':'dev-v2','review-rubric':'policy','review-question':'Follow <policy> & answer?','reviewer-a':'alice','reviewer-b':'bob'}))get(id).value=value;
  async function completePacket(role:string,values:string[]) {
    const html=evaluate('reviewerPage(reviewerPacket('+JSON.stringify(role)+'))');
    const controls=new Map<string,any>(),downloads:Blob[]=[];
    const control=(id:string)=>{if(!controls.has(id))controls.set(id,{innerHTML:'',textContent:'',value:''});return controls.get(id);};
    const {createContext,runInContext}=await import('node:vm');
    let clicks=0;
    const context=createContext({document:{getElementById:control,createElement(){return {click(){clicks++;}};}},Blob,
      URL:{createObjectURL(blob:Blob){downloads.push(blob);return 'blob:test-export';},revokeObjectURL(){}},setTimeout(fn:()=>void){fn();}});
    runInContext(html.split('<script>')[1]!.split('</script>')[0]!,context);
    control('save').onclick();assert.equal(downloads.length,0);assert.match(control('message').textContent,/Score every case/);
    values.forEach((value,i)=>{control('score-'+i).value=value;});
    control('save').onclick();assert.equal(clicks,1);assert.equal(downloads.length,1);
    const text=await downloads[0]!.text();
    const data=JSON.parse(text);assert.equal(data.schema,'evallol-review-labels-1');assert.equal(data.rows.length,2);
    assert.equal(data.rubric.text,'Follow <policy> & answer?');
    return {name:role+'.json',size:text.length,text:async()=>text};
  }
  const first=await completePacket('a',['yes','no']),second=await completePacket('b',['no','no']);
  let resolveOld!:(value:string)=>void;
  const stale=get('labels-a').onchange({target:{files:[{size:1,text:()=>new Promise<string>(resolve=>resolveOld=resolve)}]}});
  await get('labels-a').onchange({target:{files:[first]}});
  resolveOld('{}');await stale;
  assert.equal(get('review-error').textContent,'');
  await get('labels-b').onchange({target:{files:[second]}});
  assert.match(get('review-progress').textContent,/1 disagreements/);
  get('adjudicator').value='carol';get('review-disagreements').onchange({target:{dataset:{adjudicate:'pass'},value:'no'}});
  evaluate("let retainedDownload=null;downloadLocal=(name,text)=>{retainedDownload={name,text};};");
  get('review-export').onclick();
  const saved=JSON.parse(evaluate('retainedDownload.text'));
  assert.equal(saved.rows[0].humans[0].value,true);assert.equal(saved.rows[0].humans[1].value,false);
  assert.equal(saved.rows[0].adjudication.value,false);assert.equal(saved.rows[0].gold,false);
  assert.equal(saved.rubric.text,'Follow <policy> & answer?');
  assert.equal(saved.rows[1].gold,false);assert.equal(saved.rows[1].split,'dev');
  const canceled=get('labels-b').onchange({target:{files:[{size:1,text:()=>new Promise<string>(resolve=>resolveOld=resolve)}]}});
  await get('labels-b').onchange({target:{files:[]}});resolveOld(await second.text());await canceled;
  assert.equal(get('review-export').disabled,true);
  assert.match(get('review-progress').textContent,/reviewer B: waiting/);
});
