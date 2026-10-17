const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),ts=require('typescript'),resolve=Module._resolveFilename;
Module._resolveFilename=function(n,...a){return resolve.call(this,n.startsWith('@/')?path.join(root,'src',n.slice(2)):n,...a);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
(async()=>{
 const c=require('../src/lib/services/citation-format.ts');
 for(const [kind,text] of [['bib','@article{test,title={Climate evidence},author={Doe, Jane and Smith, John},year={2020}}'],['ris','TY  - JOUR\nTI  - Climate evidence\nAU  - Doe, Jane\nPY  - 2020\nER  - ']]){
  const items=c.parseBibliography(text,kind);assert.equal(items.length,1);assert.equal(items[0].author[0].family,'Doe');
  for(const style of Object.keys(c.CSL_STYLES)){const out=c.formatCitations(items,style);assert(out.bibliography[0][1].toLowerCase().includes('climate evidence'));assert(out.citations[0].text);}
 }
 assert.throws(()=>c.parseBibliography('https://internal.example/private','bib'));
 assert.throws(()=>c.parseBibliography('x'.repeat(500001),'ris'));
 const {formatEditorReference}=require('../src/lib/csl/editor-format.ts');
 const r=c.cslToReference(c.parseBibliography('@article{x,title={Climate},author={Doe, Jane},year={2020}}','bib')[0],'r');
 assert(formatEditorReference(r,'APA').inText.includes('Doe'));
 assert(formatEditorReference({...r,title:'Changed title'},'APA').full.includes('Changed title'));
 assert(!formatEditorReference({...r,authors:'Another Author'},'APA').full.includes('Doe'));
 console.log('CSL: BibTeX/RIS, four styles, author structure, local-only parsers, input limits and live edits passed.');
 const dbPath=require.resolve('../src/lib/db.ts');let scope;
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{courseReadings:{search:async(...args)=>{scope=args;return [{name:'Official.pdf',page:2,text:'A sourced conclusion.',score:0.8}];}},connections:{update:()=>{}},aiAccess:{updateModel:()=>{}}}}};
 const oldFetch=global.fetch,oldPrivacy=process.env.PRIVACY_INTERNAL_URL;process.env.PRIVACY_INTERNAL_URL='http://private';
 let llmCalls=0,nerFails=false;
 global.fetch=async(url,init)=>{
  const u=String(url),body=JSON.parse(init.body);
  if(u.endsWith('/embed'))return new Response(JSON.stringify({model:'multilingual-minilm-l12-v2-e8f8c211',dimensions:384,vectors:body.texts.map(()=>Array(384).fill(0.1))}));
  if(u.endsWith('/analyze'))return new Response(nerFails?'{}':'[]',{status:nerFails?503:200});
  if(u.includes('/chat/completions')){
   llmCalls++;assert(!init.body.includes('alice@example.org'));assert(!init.body.includes('bob@example.org'));
   const token=body.messages.at(-1).content.match(/\[TF_[^\]]+\]/)[0];
   const events=[token.slice(0,10),token.slice(10)].map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n').join('')+'data: [DONE]\n\n';
   return new Response(events,{headers:{'Content-Type':'text/event-stream'}});
  }
  throw new Error('Unexpected egress');
 };
 try{
  const {courseContext}=require('../src/lib/services/course-retrieval.ts');
  assert.equal(await courseContext({officialReadingsOnly:false},'question'),'');
  const context=await courseContext({officialReadingsOnly:true,university:'uni-a',id:'task-a'},'question');assert.equal(scope[0],'uni-a');assert.equal(scope[1],'task-a');assert(context.includes('Official.pdf'));assert(context.includes('OFFICIAL COURSE SOURCES ONLY'));
  const {streamCompletion}=require('../src/lib/ai/providers.ts');const cfg={provider:'openai',apiKey:'fixture-only',model:'fixture'};
  let answer='';for await(const chunk of streamCompletion(cfg,'User bob@example.org',[{role:'user',content:'Contact alice@example.org'}])){if(chunk.type==='delta')answer+=chunk.text;assert.notEqual(chunk.type,'error');}
  assert.equal(answer,'alice@example.org');assert.equal(llmCalls,1);
  nerFails=true;const chunks=[];for await(const chunk of streamCompletion(cfg,'Private text',[{role:'user',content:'alice@example.org'}]))chunks.push(chunk);
  assert.equal(llmCalls,1);assert.equal(chunks[0].code,'privacy_unavailable');
  console.log('Egress: system/history pseudonymized, split SSE restored, NER outage blocks provider; course retrieval scoped by university and assignment.');
 }finally{global.fetch=oldFetch;if(oldPrivacy===undefined)delete process.env.PRIVACY_INTERNAL_URL;else process.env.PRIVACY_INTERNAL_URL=oldPrivacy;}
})().catch(e=>{console.error(e);process.exitCode=1;});
