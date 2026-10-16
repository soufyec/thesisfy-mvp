// Run with: node scripts/test-product-settings.cjs
// Pure data and SVG regressions; no database, model calls or browser required.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.join(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...args); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};

const assert = require('node:assert/strict');
const os = require('node:os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'thesisfic-settings-'));
process.env.DATA_FILE=path.join(tmp,'store.json');
process.env.TEAM_PASSWORD='fixture-team-password';
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
const { defaultProductSettings, validateProductSettings, publicAssistantSettings, modeEnabled, productInstructions }=require('../src/lib/product-settings.ts');
const { db }=require('../src/lib/db.ts');
const { teamCookieValue }=require('../src/lib/team.ts');
const { NextRequest }=require('next/server');
const route=require('../src/app/api/equipe/product/route.ts');
const { buildSystemPrompt }=require('../src/lib/ai/prompts.ts');
async function main(){
 const original=defaultProductSettings();assert.deepEqual(validateProductSettings(original),original);
 for(const change of [{maxArtifacts:0},{maxArtifacts:5},{maxOutputTokens:100000},{historyMessages:1.5},{assistantEnabled:'false'},{instructions:'x'.repeat(6001)},{defaultMode:'old-mode'}])assert.throws(()=>validateProductSettings({...original,...change}));
 const disabled=defaultProductSettings();disabled.modes.copilot.enabled=false;assert.throws(()=>validateProductSettings(disabled));
 disabled.defaultMode='critique';assert(validateProductSettings(disabled));assert.equal(modeEnabled(disabled,'copilot'),false);
 const custom=defaultProductSettings();custom.instructions='Use short paragraphs.';custom.modes.critique.instructions='Prioritise methods.';custom.modes.critique.descriptions.es='Revisa el argumento.';
 custom.filesEnabled=false;custom.searchEnabled=false;custom.maxArtifacts=1;custom.maxOutputTokens=512;
 const publicConfig=JSON.stringify(publicAssistantSettings(custom));assert(!publicConfig.includes('paragraphs'));assert(!publicConfig.includes('Prioritise'));
 assert(productInstructions(custom,'critique').includes('Prioritise methods.'));
 const prompt=buildSystemPrompt({mode:'critique',policy:db.policies.get('Test'),studentName:'Student',provider:'fixture',product:custom});
 assert(prompt.includes('Prioritise methods.'));assert(prompt.includes('Never write original content'));assert(prompt.includes('downloadable research files is disabled'));
 const req=(method,body,auth=true,origin='http://localhost:3071')=>new NextRequest('http://localhost:3071/api/equipe/product',{method,headers:{'content-type':'application/json',...(auth?{cookie:'team='+teamCookieValue()}:{}),origin},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await route.GET(req('GET',null,false))).status,401);
 assert.equal((await route.PUT(req('PUT',{revision:0,settings:custom},false))).status,401);
 assert.equal((await route.PUT(req('PUT',{revision:0,settings:custom},true,'https://other.example'))).status,403);
 assert.equal((await route.PUT(req('PUT',{revision:0,settings:{...custom,maxArtifacts:9}}))).status,422);
 const saved=await route.PUT(req('PUT',{revision:0,settings:custom}));assert.equal(saved.status,200);assert.equal((await saved.json()).settings.revision,1);
 assert.equal((await route.PUT(req('PUT',{revision:0,settings:original}))).status,409);
 const got=await (await route.GET(req('GET'))).json();assert.equal(got.settings.modes.critique.descriptions.es,'Revisa el argumento.');assert(got.persistent);
 const clone=db.productSettings.get();clone.instructions='Mutated';assert.equal(db.productSettings.get().instructions,custom.instructions);
 await new Promise(r=>setTimeout(r,400));assert.equal(JSON.parse(fs.readFileSync(process.env.DATA_FILE)).productSettings.revision,1);
 console.log('Product settings passed: team authentication, cross-origin denial, validation/bounds, revision conflicts, locale descriptions, private instructions, core prompt preservation, detached reads and persisted configuration.');
 fs.rmSync(tmp,{recursive:true,force:true});
}
main().catch(e=>{console.error(e);process.exitCode=1;});
