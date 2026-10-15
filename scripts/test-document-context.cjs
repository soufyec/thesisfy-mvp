// Run with: node scripts/test-document-context.cjs
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
const { documentContext, MAX_DOCUMENT_CHARS } = require('../src/lib/ai/document-context.ts');
const { buildSystemPrompt } = require('../src/lib/ai/prompts.ts');
const thesis={title:'Climate modelling',content:'<h1>Introduction</h1><p>Ocean &amp; satellite observations.</p><script>hidden()</script>',tabs:[{id:'notes',title:'Research notes',content:'<p>Saved notes</p>'}],wordCount:457,provenance:{ai:0},targetWords:1000,citationStyle:'APA',status:'draft',kind:'thesis'};
const saved=documentContext(thesis,undefined,true,'evaluate my argument');
assert(saved.text.includes('Ocean & satellite'));assert(!saved.text.includes('hidden()'));assert(!saved.live);
const live=documentContext(thesis,{tabId:'notes',text:'Unsaved counterargument about climate uncertainty.'},true,'critique');
assert.equal(live.title,'Research notes');assert(live.text.startsWith('Unsaved'));assert(live.live);assert(!live.text.includes('Ocean'));
assert.equal(documentContext(thesis,{tabId:'submission',text:''},true,'critique').text,'');
assert.equal(documentContext(thesis,{tabId:'notes',text:'Spoofed draft'},false,'critique').text,saved.text);
assert.equal(documentContext(thesis,{tabId:'submission',text:7},true,'critique').text,saved.text);
const large=('Opening section. '.repeat(5000))+'HYDROLOGICAL_UNCERTAINTY appears deep in the discussion.'+(' End section.'.repeat(5000));
const partial=documentContext(thesis,{tabId:'submission',text:large},true,'hydrological_uncertainty');
assert(partial.partial);assert(partial.text.length<=MAX_DOCUMENT_CHARS);assert(partial.text.includes('HYDROLOGICAL_UNCERTAINTY'));assert.equal(partial.totalChars,large.length);
const policy={university:'Test',maxAiUsagePercent:25,blockGeneration:true,allowedModes:['critique'],researchCopilot:true};
const prompt=buildSystemPrompt({mode:'critique',policy,thesis,studentName:'Student',provider:'Test',context:{document:live,library:{passages:[],rule:'Answer only from these passages.'}}});
assert(prompt.includes('Unsaved counterargument'));assert(prompt.includes('live editor'));assert(prompt.includes('does not require library matches'));assert(prompt.includes('Do not ask the student to paste'));
console.log('Document context passed: saved text, live tab, unsaved changes, explicit empty draft, staff snapshot rejection, long-document excerpts and library separation.');
