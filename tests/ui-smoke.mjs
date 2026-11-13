import {Window} from 'happy-dom';
import * as indexed from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const win=new Window({url:'https://chaos-test.local',settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
Object.defineProperty(win,'indexedDB',{value:indexed.indexedDB});Object.defineProperty(win,'IDBKeyRange',{value:indexed.IDBKeyRange});
// A browser does not provide Node's Buffer global. Do not inherit it from the test host.
win.Buffer=undefined;
win.document.write(await readFile('dist/index.html','utf8'));win.eval(await readFile('dist/app.js','utf8'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async fn=>{for(let i=0;i<120;i++){if(fn())return;await delay(20);}throw new Error('Timed out waiting for UI state');};
const click=sel=>{const el=win.document.querySelector(sel);assert.ok(el,`Missing ${sel}`);el.click();};
const dbl=sel=>{const el=win.document.querySelector(sel);assert.ok(el,`Missing ${sel}`);el.dispatchEvent(new win.MouseEvent('dblclick',{bubbles:true}));};
try{
await waitFor(()=>win.chaosLab);const state=win.chaosLab.getState();const active=()=>state.tabs[state.active];
assert.equal(win.document.querySelectorAll('#plane [data-node]').length,6);assert.equal(state.history.length,5);assert.equal(state.branches.length,2);
const search=win.document.querySelector('#block-search');search.value='differentiate';search.dispatchEvent(new win.Event('input',{bubbles:true}));assert.equal(win.document.querySelectorAll('[data-block]').length,1);
dbl('[data-block="differentiate"]');assert.equal(active().model.nodes.length,7);const added=state.selected;
click('[data-id="random"][data-port="out"]');click(`[data-id="${added}"][data-port="x"]`);assert.ok(active().model.edges.some(e=>e.to===added&&e.from==='random'));
click('[data-action="tapselection"]');assert.equal(active().model.nodes.length,8);assert.equal(active().model.nodes.at(-1).source.id,added);
click('[data-action="undo"]');assert.equal(active().model.nodes.length,7);click('[data-action="redo"]');assert.equal(active().model.nodes.length,8);
click(`[data-node="${added}"]`);click('[data-action="copy"]');click('[data-tab="1"]');win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true}));assert.equal(active().model.nodes.length,7);
click('[data-action="split"]');assert.ok(win.document.querySelector('.split-container [data-compare-node]'));click('[data-action="split"]');assert.ok(!win.document.querySelector('.split-container'));
click('[data-action="save"]');await waitFor(()=>!state.busy);assert.equal(active().dirty,false);assert.equal(state.history.length,6);assert.match(active().base,/^[a-f0-9]{40}$/);
click('[data-action="source"]');assert.ok(win.document.querySelector('.source-view pre').textContent.includes('package Logistic_exploration'));
click('[data-action="source"]');click('[data-action="new"]');win.document.querySelector('#new-name').value='Blank experiment';win.document.querySelector('#new-template').value='empty';click('[data-action="newsubmit"]');await waitFor(()=>active().model.name==='Blank experiment');assert.equal(active().model.nodes.length,0);
click('[data-action="save"]');await waitFor(()=>!state.busy);assert.equal(active().dirty,false);
console.log('UI smoke passed: boot, search, add, wire, tap, undo/redo, cross-tab copy/paste, split view, real Git save, SysML source, and blank model creation.');
await win.happyDOM.close();process.exit(0);
}catch(e){console.error(e);await win.happyDOM.close();process.exit(1);}
