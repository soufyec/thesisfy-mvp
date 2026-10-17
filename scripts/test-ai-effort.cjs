const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),ts=require('typescript'),resolve=Module._resolveFilename;
Module._resolveFilename=function(n,...a){return resolve.call(this,n.startsWith('@/')?path.join(root,'src',n.slice(2)):n,...a);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {supportedEfforts,geminiThinking}=require('../src/lib/ai/effort.ts');
assert.deepEqual(supportedEfforts('google','gemini-3.1-pro-preview'),['low','high']);assert.deepEqual(supportedEfforts('anthropic','claude-opus-5-5'),['low','medium','high']);assert.deepEqual(supportedEfforts('anthropic','claude-opus-5-5','foundry_claude'),['medium']);assert.deepEqual(supportedEfforts('openai','gpt-4o'),['medium']);assert.equal(geminiThinking('gemini-2.5-flash','high',4096).thinkingBudget,3584);
const id=require.resolve('../src/lib/db.ts');let models=[];
require.cache[id]={id,filename:id,loaded:true,exports:{db:{aiAccess:{funding:()=>({institutionPays:true,monthlyBudget:0,perStudentMonthly:0,usdRate:1}),models:()=>models,monthUsage:()=>[]},connections:{update:()=>{}},users:{}}}};
process.env.GEMINI_API_KEY='fixture';process.env.PRIVACY_INTERNAL_URL='http://private';
let claudeRequest;const sdkId=require.resolve('@anthropic-ai/sdk');
class ClaudeFixture { constructor(){this.beta={messages:{stream(body){claudeRequest=body;return {async *[Symbol.asyncIterator](){yield {type:'content_block_delta',delta:{type:'text_delta',text:'Claude answer'}};},async finalMessage(){return {usage:{input_tokens:12,output_tokens:24}};}};}}};} }
require.cache[sdkId]={id:sdkId,filename:sdkId,loaded:true,exports:ClaudeFixture};
(async()=>{
 const {streamCompletion,resolveProvider}=require('../src/lib/ai/providers.ts');const user={id:'fixture',university:'a',name:'Alice',email:'alice@example.org',preferences:{}};const policy={allowedProviders:['google'],allowBYOK:false};
 assert.equal(resolveProvider(user,policy,'google').billedTo,'institution');models=[{id:'disabled',university:'a',enabled:false}];assert.equal(resolveProvider(user,policy,'google').provider,'demo');
 const oldFetch=global.fetch;let requests=[];
 global.fetch=async(url,init)=>{
  if(String(url).endsWith('/analyze'))return new Response('[]');
  requests.push({url:String(url),body:JSON.parse(init.body)});
  return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'hidden reasoning',thought:true},{text:'answer'}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:30}})+'\n\n');
 };
 try{const chunks=[];for await(const chunk of streamCompletion({provider:'google',model:'gemini-3.8-flash',apiKey:'fixture'},'Help',[{role:'user',content:'A question'}],4096,'high'))chunks.push(chunk);assert.equal(chunks.filter(c=>c.type==='delta').map(c=>c.text).join(''),'answer');assert.equal(chunks.find(c=>c.type==='usage').outputTokens,50);assert.equal(requests[0].body.generationConfig.thinkingConfig.thinkingLevel,'HIGH');assert(requests[0].url.includes('gemini-3.8-flash'));}finally{global.fetch=oldFetch;}
 global.fetch=async()=>new Response('[]');
 try {const chunks=[];for await(const chunk of streamCompletion({provider:'anthropic',model:'claude-sonnet-5-5',apiKey:'fixture'},'Help',[{role:'user',content:'A question'}],4096,'low'))chunks.push(chunk);assert.equal(claudeRequest.model,'claude-sonnet-5-5');assert.equal(claudeRequest.output_config.effort,'low');assert.equal(chunks.find(c=>c.type==='usage').outputTokens,24);assert.equal(chunks.find(c=>c.type==='delta').text,'Claude answer');}finally{global.fetch=oldFetch;}
 console.log('AI effort passed: capability-specific levels, bounded thinking, fixed Claude/Gemini model identity and effort transport, Gemini reasoning billed once and never rendered, institutional platform usage included, configured catalogue respected.');
})().catch(e=>{console.error(e);process.exitCode=1;});
