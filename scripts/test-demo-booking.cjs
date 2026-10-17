// Run with: node scripts/test-demo-booking.cjs
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

const assert=require('node:assert/strict');
const {demoBookingUrl}=require('../src/lib/demo-booking.ts');
const url='https://cal.com/soufyan-ess-dnaecp/demo-thesisfic';
assert.equal(demoBookingUrl(url),url);
for(const input of [undefined,'','javascript:alert(1)','http://cal.com/user/demo','https://evil.example/user/demo','https://cal.com@evil.example/user/demo','https://cal.com/signup','https://cal.com/auth/login','https://user:password@cal.com/user/demo'])assert.equal(demoBookingUrl(input),null);
console.log('Demo booking URL checks passed: verified event accepted, missing/configuration and unsafe destinations rejected.');
