// Run with: node scripts/test-data-filters.cjs
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
const { buildSheets } = require('../src/lib/sources/sheets.ts');
const { tryRunAnalysis, planFromRequest } = require('../src/lib/data/analysis.ts');
const { computeArtifacts, artifactsFromAnswer } = require('../src/app/api/ai/chat/artifacts.ts');
const { createWorkspaceArtifact } = require('../src/lib/data/workspace.ts');
const { normalizeFilters, filterSheet, requestedYearFilters } = require('../src/lib/data/filters.ts');
const { translator } = require('../src/lib/i18n/dictionary.ts');
const rows=[['year','region','annual_rainfall_mm'], ...Array.from({length:11},(_,i)=>[2010+i,'North',100+i]), ...Array.from({length:11},(_,i)=>[2010+i,'South',200+i])];
const data={id:'d',sourceId:'s',ownerId:'u',sha256:'hash',cells:66,createdAt:'now',sheets:buildSheets([{name:'Rain',cut:false,rows}]).sheets};
const before=JSON.stringify(data),tr=translator('es');
const filters=[{column:'year',op:'between',value:[2012,2014]}];
const spec={op:'trend',x:'year',y:'annual_rainfall_mm',by:'region',filters};
const meta={fileName:'rain.csv',sourceId:'s',interactionId:'i',lang:'es'};
const run=tryRunAnalysis(spec,data,meta,tr);
assert(run.ok, JSON.stringify(run));
assert.deepEqual(run.artifact.chart.categories,['2012','2013','2014']);
assert.equal(run.artifact.n,6);
assert.deepEqual(run.artifact.chart.series[0].values,[102,103,104]);
assert.equal(JSON.stringify(data),before);
assert.deepEqual(run.artifact.spec.filters,filters);
assert(run.artifact.table.notes.some(n=>n.includes('6 de 22')));
for(const prompt of ['QUIERO QUE CREES UNA GRAFICA DESDE 2012 HASTA 2014','plot from 2012 to 2014','entre 2012 et 2014','von 2012 bis 2014']) {
 const plan=planFromRequest(prompt,data,tr);assert.equal(plan[0].op,'trend');assert.deepEqual(plan[0].filters,filters);
}
assert.equal(requestedYearFilters('Compare 2012 vs 2014', data.sheets[0]).length,0);
assert.equal(requestedYearFilters('from 2012 to 2014 and from 2016 to 2018', data.sheets[0]).length,0);
const opts={lang:'es',tr,newId:()=> 'a',interactionId:'i',requestText:'gráfica desde 2012 hasta 2014'};
const attachments=[{sourceId:'s',fileName:'rain.csv',dataset:data}];
const pipeline=computeArtifacts([{op:'trend',x:'year',y:'annual_rainfall_mm',by:'region'}],attachments,opts);
assert.equal(pipeline.errors.length,0);assert.deepEqual(pipeline.artifacts[0].chart.categories,['2012','2013','2014']);
const recreated=createWorkspaceArtifact(data,pipeline.artifacts[0].dataSelection,{...meta,id:'again'},tr);
assert.deepEqual(recreated.chart.categories,['2012','2013','2014']);
const category=tryRunAnalysis({...spec,filters:[...filters,{column:'region',op:'eq',value:'North'}]},data,meta,tr);
assert(category.ok);assert.equal(category.artifact.n,3);
for(const [bad,code] of [
 [[{column:'year',op:'between',value:[2030,2035]}],'no_matching_rows'],
 [[{column:'year',op:'between',value:[2014,2012]}],'invalid_filter'],
 [[{column:'year',op:'between',value:[2012]}],'invalid_filter'],
 [[{column:'year',op:'delete',value:2012}],'invalid_filter'],
 [[{column:'absent',op:'eq',value:1}],'unknown_column'],
 [[{column:'year',op:'gte',value:'bad'}],'invalid_filter'],
 [null,'invalid_filter']]) {
 const result=tryRunAnalysis({...spec,filters:bad},data,meta,tr);assert.equal(result.ok,false);assert.equal(result.code,code);
}
const dates={...data,sheets:buildSheets([{name:'Dates',cut:false,rows:[['date','value'],['2011-12-31',1],['2012-01-01',2],['2014-12-31',3],['2015-01-01',4]]}]).sheets};
const dated=tryRunAnalysis({op:'trend',x:'date',y:'value',filters:[{column:'date',op:'between',value:[2012,2014]}]},dates,meta,tr);
assert(dated.ok,JSON.stringify(dated));assert.equal(dated.artifact.n,2);
const selected=filterSheet(data.sheets[0],normalizeFilters(filters,data.sheets[0],ref=>data.sheets[0].columns.findIndex(c=>c.name===ref)));
assert.deepEqual(selected.rowNumbers,[4,5,6,15,16,17]);
const empty=computeArtifacts([{...spec,filters:[{column:'year',op:'eq',value:2030}]}],attachments,{...opts,requestText:''});
assert.equal(empty.artifacts.length,0);assert.equal(empty.errors[0].code,'no_matching_rows');
console.log('Filters passed: inclusive years/dates, grouped values, AND conditions, no source mutation, original rows, multilingual planner, omitted model filter enforcement, editable round trip and invalid/empty refusal.');

const limited=computeArtifacts([spec,spec],attachments,{...opts,maxArtifacts:1});
assert.equal(limited.artifacts.length,1);assert.equal(limited.errors.length,1);
const rawSheet={...data.sheets[0],data:data.sheets[0].data.map(c=>[...c])};rawSheet.data[2][0]=null;
const missing=normalizeFilters([{column:'annual_rainfall_mm',op:'isMissing'}],rawSheet,ref=>rawSheet.columns.findIndex(c=>c.name===ref));
assert.equal(filterSheet(rawSheet,missing).rowCount,1);
for(const [op,value,expected] of [['gt',2018,4],['gte',2018,6],['lt',2012,4],['lte',2012,6],['in',[2012,2014],4],['neq',2012,20]]){
 const f=normalizeFilters([{column:'year',op,value}],data.sheets[0],ref=>data.sheets[0].columns.findIndex(c=>c.name===ref));
 assert.equal(filterSheet(data.sheets[0],f).rowCount,expected);
}
console.log('All numeric operators, inclusion, missing values and configured artifact cap passed.');
