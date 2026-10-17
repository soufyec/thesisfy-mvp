// Run with: node scripts/test-questionnaire-editor.cjs
// Questionnaire data and translation regressions; no database, model calls or browser required.
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
const { BASE, keyOf, withEdits, canRemoveQuestion, toCsv, validateSubmission, nextSectionId, visibleItems, SUBMIT }=require('../src/lib/questionnaire.ts');
const {questionnaireText,questionTitle,questionLabel}=require('../src/lib/questionnaire/translate.ts');
const {extraUI}=require('../src/lib/questionnaire/ui-extra.ts');
const {questionnaire:ui}=require('../src/lib/i18n/messages/questionnaire.ts');
const sources=require('../src/data/questionnaire-strings.json');
const before=JSON.stringify(BASE),section=BASE.sections.find(s=>s.id==='p_controle');
const key=keyOf(section,section.items[0]),second=keyOf(section,section.items[1]);
const edit=(kind,data,n=0)=>({id:'change'+n,kind,sectionId:section.id,createdAt:new Date(n).toISOString(),...data});
const edits=[edit('update',{targetKey:key,item:{title:'Corrected question',type:'text',help:'Clear help'}}),edit('order',{keys:[second,key,...section.items.slice(2).map(i=>keyOf(section,i))]},1),edit('remove',{targetKey:second},2)];
const updated=withEdits(edits),s=updated.sections.find(s=>s.id===section.id);
assert.equal(s.items[0].title,'Corrected question');assert.equal(s.items[0].type,section.items[0].type);assert(!s.items.some(i=>keyOf(s,i)===second));
assert(withEdits(edits,true).sections.find(s=>s.id===section.id).items.some(i=>keyOf(section,i)===second));
assert(toCsv(withEdits(edits,true),[{id:'r',createdAt:'today',answers:{[second]:'historical answer'},path:[section.id],mode:'en_ligne',profil:'enseignant',interviewer:null,durationSeconds:60}]).includes('historical answer'));
const restored=withEdits(edits.filter(e=>e.kind!=='remove')).sections.find(s=>s.id===section.id);assert.equal(keyOf(restored,restored.items[0]),second);
for(const id of ['start_1','mode','profil'])assert(!canRemoveQuestion(BASE.sections[0].items.find(i=>i.id===id)));
assert.equal(JSON.stringify(BASE),before);
const translation=withEdits([edit('update',{targetKey:key,locale:'es',item:{title:'Texto revisado',translations:{es:{labels:{[section.items[0].choices?.[0]||'x']:'Etiqueta'}}}}})]).sections.find(s=>s.id===section.id).items[0];
assert.equal(translation.title,section.items[0].title);assert.equal(questionTitle('es',translation),'Texto revisado');
for(const language of ['en','es','de','pt','ar']){
 const catalogue=require('../src/data/questionnaire-'+language+'.json');assert.equal(catalogue.length,sources.length);assert(catalogue.every(x=>typeof x==='string'&&x.length>0));
 assert.notEqual(questionnaireText(language,BASE.title),BASE.title);
 assert.notEqual(questionLabel(language,{title:'x',id:'x',type:'mc'},'Oui'),'Oui');
}
for(const language of ['pt','ar'])for(const key of Object.keys(ui.en))assert(extraUI[language][key],language+': '+key);
// Build a complete, canonical response in a non-French display language: the same keys/values validate.
const answers={mode:BASE.sections[0].items.find(i=>i.id==='mode').choices[0],profil:BASE.sections[0].items.find(i=>i.id==='profil').choices[1]};
let current=BASE.sections[0];const responsePath=[];
while(current&&responsePath.length<BASE.sections.length){responsePath.push(current.id);for(const item of visibleItems(current,'en_ligne')){const k=keyOf(current,item);if(answers[k]!==undefined||!item.req)continue;answers[k]=item.type==='cb'?[item.choices[0]]:item.type==='scale'?(item.min??1):item.type==='grid'?Object.fromEntries(item.rows.map(r=>[r,item.cols[0]])):item.type==='mc'?item.choices[0]:'A valid answer';}const next=nextSectionId(BASE,current,answers,'en_ligne');if(next===SUBMIT)break;current=BASE.sections.find(s=>s.id===next);}
assert(validateSubmission(BASE,{answers,path:responsePath,durationSeconds:100}).ok);
assert(!validateSubmission(BASE,{answers:{},path:[BASE.sections[0].id],durationSeconds:0}).ok);
console.log('Questionnaire checks passed: edits/order/removal/undo, stable types/keys, archived CSV, protected routing, six catalogues, translated labels and canonical submission validation.');
