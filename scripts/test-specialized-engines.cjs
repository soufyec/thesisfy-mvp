// Deterministic adapter/privacy regressions. No network, database or commercial API credentials.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { AcademicSearchService } = require('../src/lib/services/academic-search.ts');
const { PIIScrubberService, PrivacyUnavailableError, createPresidioAnalyzer } = require('../src/lib/services/pii-scrubber.ts');
async function testServices() {
  const work = { id:'W1', doi:'10.1234/TEST', title:'A real indexed record', authors:'Author, A.', year:'2020', source:'openalex' };
  let s2calls = 0;
  const service = new AcademicSearchService({ openalex:async()=>[work,{...work,doi:'10.1234/retracted',isRetracted:true},{...work,doi:'bad'},{...work,doi:'10.1234/no-author',authors:''}],crossref:async()=>[{...work,source:'crossref'},{...work,doi:'10.1234/retracted',source:'crossref'}],s2:async()=>{s2calls++;return null;} });
  const data = await service.search({query:'climate'});
  assert.equal(data.papers.length,1); assert.equal(data.papers[0].doi,'10.1234/test'); assert.equal(s2calls,0);
  assert.equal(data.papers[0].verification,'indexed_metadata');assert.equal(service.suggestions(data.papers)[0].candidateId,'doi:10.1234/test');
  const down=async()=>{throw new Error('private upstream error');};
  const fallback = await new AcademicSearchService({openalex:down,crossref:async()=>[work],s2:down}).search({query:'climate'});
  assert.equal(fallback.status,'ok');assert.equal(fallback.providers[0].status,'unavailable');
  assert.equal((await new AcademicSearchService({openalex:down,crossref:down,s2:down}).search({query:'q'})).status,'unavailable');
  assert.equal((await new AcademicSearchService({openalex:async()=>[],crossref:down,s2:async()=>null}).search({query:'q'})).status,'empty');
  assert.equal((await new AcademicSearchService({openalex:async()=>[],crossref:async()=>[],s2:async()=>work}).search({query:'q'})).papers.length,1);
  await assert.rejects(()=>service.search({query:'q',limit:0}),/invalid_input/);
  await assert.rejects(()=>service.search({query:'x'.repeat(501)}),/invalid_input/);
  await assert.rejects(()=>new PIIScrubberService().scrub('Hello'),PrivacyUnavailableError);
  const scrub = new PIIScrubberService({knownNames:['Ana (Test)'],requireNER:false});
  const original='Ana (Test) uses ana@example.org and +33 6 12 34 56 78.';
  const safe=await scrub.scrub(original,'fr');
  assert(!safe.text.includes('Ana (Test)')); assert(!safe.text.includes('ana@example.org'));assert(!safe.text.includes('+33'));
  assert.equal(scrub.restore(safe.text),original);assert.equal(safe.summary.strategy,'local_patterns');
  for (let i=0;i<=safe.text.length;i++) { const restore=scrub.streamRestorer(); assert.equal(restore(safe.text.slice(0,i))+restore(safe.text.slice(i))+restore('',true), original); }
  const again=await scrub.scrub('ana@example.org'); assert(safe.text.includes(again.text));
  const other = new PIIScrubberService({requireNER:false});assert.notEqual((await other.scrub('ana@example.org')).text,again.text);
  const unicode='📚 Alice lives in Paris';
  let sent;
  const analyzer=createPresidioAnalyzer('http://private-presidio:3000',async(url,init)=>{
    sent={url:String(url),...JSON.parse(init.body)};
    return new Response(JSON.stringify([{start:2,end:7,entity_type:'PERSON'},{start:17,end:22,entity_type:'LOCATION'}]));
  });
  const privateScrub=new PIIScrubberService({analyzer});const privateSafe=await privateScrub.scrub(unicode);
  assert(!privateSafe.text.includes('Alice'));assert(!privateSafe.text.includes('Paris'));assert(privateSafe.text.startsWith('📚 '));assert.equal(privateScrub.restore(privateSafe.text),unicode);
  assert.equal(sent.url,'http://private-presidio:3000/analyze');assert.equal(sent.text,unicode);
  await assert.rejects(()=>new PIIScrubberService({analyzer:down}).scrub(original),PrivacyUnavailableError);
  await assert.rejects(()=>new PIIScrubberService({analyzer:async()=>[{start:-1,end:3,entity:'PERSON'}]}).scrub(original),PrivacyUnavailableError);
  const overlap=new PIIScrubberService({knownNames:['Alice'],analyzer:async()=>[{start:2,end:9,entity:'PERSON'}]});
  const merged=await overlap.scrub('Alice Doe');assert(!merged.text.includes('Doe'));assert.equal(overlap.restore(merged.text),'Alice Doe');
  const empty=await scrub.scrub('Climate data 2012–2014');assert.equal(empty.text,'Climate data 2012–2014');
  scrub.dispose();assert.throws(()=>scrub.restore(safe.text),/disposed/);await assert.rejects(()=>scrub.scrub('x'),/invalid_input/);
  console.log('Specialized engines passed: deduplication, metadata validation, partial/total failures, S2 fallback, privacy fail-closed, known identities, stable request tokens, isolation, Unicode NER offsets, overlap union and disposal.');
}

// Route boundary tests with authenticated fixture and stubbed private/academic APIs.
(async () => {
  await testServices();
  const { NextRequest, NextResponse } = require('next/server');
  let authenticated=true, enabled=true, networkCalls=0;
  const user={id:'fixture',name:'Alice',email:'alice@example.org'};
  const dbPath=require.resolve('../src/lib/db.ts'),apiPath=require.resolve('../src/lib/api.ts');
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{productSettings:{get:()=>({assistantEnabled:enabled,searchEnabled:enabled})}}}};
  require.cache[apiPath]={id:apiPath,filename:apiPath,loaded:true,exports:{requireUser:async()=>authenticated?{user}:{response:NextResponse.json({error:'Not authenticated'},{status:401})}}};
  const {POST}=require('../src/app/api/academic/search/route.ts');
  const oldUrl=process.env.PRESIDIO_ANALYZER_URL,oldFetch=global.fetch;
  const call=body=>POST(new NextRequest('http://localhost/api/academic/search',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}));
  try {
    global.fetch=async(url,init)=>{
      networkCalls++;
      if(String(url).includes('private-presidio')) return new Response('[]');
      assert(!String(url).includes('alice%40example'));assert(!String(url).includes('Alice'));
      if(String(url).includes('openalex'))return new Response(JSON.stringify({results:[{id:'https://openalex.org/W1',doi:'https://doi.org/10.1234/test',display_name:'Climate',authorships:[{author:{display_name:'Researcher Jane'}}],publication_year:2020}]}));
      if(String(url).includes('crossref'))return new Response(JSON.stringify({message:{items:[]}}));
      throw new Error('unexpected network');
    };
    authenticated=false;assert.equal((await call({query:'climate'})).status,401);assert.equal(networkCalls,0);
    authenticated=true;enabled=false;assert.equal((await call({query:'climate'})).status,403);assert.equal(networkCalls,0);enabled=true;
    assert.equal((await call({query:'x'.repeat(9000)})).status,413);
    assert.equal((await call('{bad json')).status,400);assert.equal((await call({query:'q',language:'xx'})).status,400);
    delete process.env.PRESIDIO_ANALYZER_URL;
    const fail=await call({query:'climate'});assert.equal(fail.status,503);assert.equal((await fail.json()).code,'privacy_unavailable');assert.equal(networkCalls,0);
    process.env.PRESIDIO_ANALYZER_URL='http://private-presidio:3000';
    const privateOnly=await call({query:'alice@example.org'});assert.equal(privateOnly.status,400);assert.equal(networkCalls,1);
    const result=await call({query:'Alice climate alice@example.org'});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
    const body=await result.json();assert(body.ok);assert.equal(body.data.papers.length,1);assert.equal(body.data.suggestions[0].candidateId,'doi:10.1234/test');
    assert(!JSON.stringify(body).includes('alice@example.org'));
    console.log('Academic route passed: auth, product toggle, bounded/malformed input, missing private NER fails closed without egress, identity-only query refused, redacted provider query and no-store response.');
  } finally { global.fetch=oldFetch;if(oldUrl===undefined)delete process.env.PRESIDIO_ANALYZER_URL;else process.env.PRESIDIO_ANALYZER_URL=oldUrl; }
})().catch(error=>{console.error(error);process.exitCode=1;});
