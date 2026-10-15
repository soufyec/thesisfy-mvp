// Run with: node scripts/test-data-workspace.cjs
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
const {extractResearchFiles,stripResearchFiles,researchCsv} = require('../src/lib/ai/files.ts');
const {checkPolicy} = require('../src/lib/ai/policy.ts');
const {buildSystemPrompt} = require('../src/lib/ai/prompts.ts');
const {missingKeys} = require('../src/lib/i18n/dictionary.ts');
const {searchResearch,researchContext} = require('../src/lib/ai/research.ts');
const wrap = file => 'Ready\n```thesisfic-file\n'+JSON.stringify(file)+'\n```';
const file={name:'../../unsafe name.md',title:'Brief',format:'md',content:'# Evidence\nSource material, never invented findings.'};
const parsed=extractResearchFiles(wrap(file),()=> 'file-1');assert.equal(parsed.files[0].name,'unsafe-name.md');assert.equal(parsed.text,'Ready');
assert.equal(stripResearchFiles('Answer\n```thesisfic-file\n{"content":"partial'), 'Answer');
assert.equal(extractResearchFiles(wrap({...file,format:'html'})).invalid,1);
assert.equal(extractResearchFiles(wrap({...file,content:'x'.repeat(120001)})).files.length,0);
assert.equal(extractResearchFiles(wrap({...file,format:'json',content:'invalid'})).invalid,1);
assert.equal(extractResearchFiles(wrap({...file,format:'py',name:'analysis.py',content:'print("Do not run automatically")'})).files[0].format,'py');
const csv=extractResearchFiles(wrap({...file,format:'csv',name:'matrix.csv',content:'Label,Value\n"=HYPERLINK(""bad"")",-7.5\n'})).files[0].content;
assert(csv.includes("'=HYPERLINK"));assert(csv.includes('"-7.5"'));assert(!csv.includes("'-7.5"));
assert.equal(researchCsv([['-7,5','+.5']]), '"-7,5","+.5"');
assert.equal(researchCsv([['a,b','a"b',-2]]),'"a,b","a""b","-2"');
const policy={university:'Test',researchCopilot:true,blockGeneration:true,allowedModes:['critique','grammar','citations','gaps'],maxAiUsagePercent:25};
assert(checkPolicy(policy,'copilot','Write a research report based on these interview notes.').allowed);
assert(!checkPolicy(policy,'critique','Write my thesis introduction for me.').allowed);
assert(!checkPolicy({...policy,researchCopilot:false},'copilot','Help').allowed);
const system=buildSystemPrompt({mode:'copilot',policy,thesis:{title:'AI adoption',description:'Interview evidence',wordCount:100,provenance:{ai:0},targetWords:1000,citationStyle:'APA',status:'draft',kind:'thesis'},studentName:'Student',provider:'Test'});
assert(system.includes('Stay within the objective'));assert(system.includes('ask one concise question'));assert(system.includes('AI adoption'));assert(system.includes('thesisfic-file'));assert(!system.includes('Never write original content'));
assert(Object.values(missingKeys()).every(keys=>keys.length===0));
(async()=>{
 const originalFetch=global.fetch;
 try{
  global.fetch=async url=>{assert(String(url).startsWith('https://api.crossref.org/works?'));return new Response(JSON.stringify({message:{items:[{DOI:'10.1234/example',title:['Relevant study'],author:[{family:'Smith',given:'A'}],issued:{'date-parts':[[2025]]},abstract:'<jats:p>Abstract only.</jats:p>',score:5}]}}));};
  const result=await searchResearch('Find sources on adoption','AI in companies');assert.equal(result.status,'ok');assert.equal(result.works[0].abstract,'Abstract only.');assert(researchContext(result).includes('not full-text'));
  global.fetch=async()=>new Response('',{status:503});assert.equal((await searchResearch('topic')).status,'unavailable');
 }finally{global.fetch=originalFetch;}
 console.log('Research regressions passed: file parsing/limits, partial stream, CSV safety, policy scope, prompt objective, translations, scholarly metadata and search failure.');
})().catch(e=>{console.error(e);process.exitCode=1;});
