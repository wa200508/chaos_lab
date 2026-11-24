import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['scripts/server.cjs','--port','0','--no-open'],{stdio:['ignore','pipe','pipe']});
const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Server startup timed out: '+out)),15000);server.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.on('exit',code=>reject(Error('Server exited '+code)));});
let browser;
try{
 const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 browser=await chromium.launch({headless:true,executablePath});
 const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // The local distribution works without external network services or fonts.
 await context.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
 await page.goto(url);await page.waitForFunction(()=>window.chaosLab);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.evaluate(()=>window.chaosLab.getState().sim.engine),'symbolic-distributions/v2');
 assert.equal(await page.locator('.tap-node .histogram rect').count(),68);
 assert.equal(await page.locator('[data-action="select"]').textContent(),'');
 async function histogramCounts(){const data=await page.evaluate(()=>{const s=window.chaosLab.getState();return {rendered:s.renderer.render(s.sim.laws.logistic),errors:s.sim.errors,model:s.tabs[s.active].model};});assert.equal(data.rendered.status,'ready',JSON.stringify(data));return data.rendered.histogram.counts;}
 const original=await histogramCounts();
 await page.locator('[data-action="settings"]').click();await page.locator('#settings-seed').fill('999');await page.locator('[data-action="settingssubmit"]').click();
 await page.waitForFunction(()=>window.chaosLab.getState().tabs[window.chaosLab.getState().active].model.seed===999);
 const reseeded=await histogramCounts();assert.deepEqual(reseeded,original);
 await page.locator('[data-param="r"]').fill('3.2');await page.locator('[data-param="r"]').press('Tab');
 const changed=await histogramCounts();assert.notDeepEqual(changed,original);
 await page.locator('[data-action="analytics"]').first().click();assert.ok(await page.locator('.distribution-method').innerText().then(s=>s.includes('numerical')));
 await page.locator('[data-action="split"]').first().click();assert.equal(await page.locator('.split-container').count(),1);await page.locator('[data-action="split"]').first().click();
 await page.locator('[data-action="export"]').click();
 for(const [action,extension]of [['exportpython','.py'],['exportjulia','.jl']]){const pending=page.waitForEvent('download');await page.locator('[data-action="'+action+'"]').click();const file=await pending;assert.ok(file.suggestedFilename().endsWith(extension));}
 await page.locator('[data-action="closemodal"]').click();
 const before=await page.evaluate(()=>window.chaosLab.getState().history.length);await page.locator('[data-action="save"]').click();await page.waitForFunction(()=>!window.chaosLab.getState().busy);assert.equal(await page.evaluate(()=>window.chaosLab.getState().history.length),before+1);

 // Build an isolated model to exercise custom signatures and actual pointer wiring.
 await page.locator('[data-action="new"]').click();await page.locator('#new-name').fill('Twelve input test');await page.locator('#new-template').selectOption('empty');await page.locator('[data-action="newsubmit"]').click();
 await page.waitForFunction(()=>{const s=window.chaosLab.getState();return s.tabs[s.active].model.name==='Twelve input test';});
 await page.locator('#block-search').fill('Uniform');await page.locator('[data-block="uniform"]').dblclick();
 const sourceId=await page.evaluate(()=>{const s=window.chaosLab.getState();return s.tabs[s.active].model.nodes[0].id;});
 await moveNode(sourceId,10,80);
 await page.locator('#block-search').fill('Custom function');await page.locator('[data-block="custom"]').dblclick();
 const customId=await page.evaluate(()=>window.chaosLab.getState().selected);
 assert.equal(await page.locator(`[data-node="${customId}"] .port.in`).count(),1);
 await page.locator('#expression').fill(Array.from({length:12},(_,i)=>'u'+(i+1)).join('+'));await page.locator('#expression').press('Tab');
 assert.equal(await page.locator(`[data-node="${customId}"] .port.in`).count(),12);
 async function moveNode(id,x,y){const header=await page.locator(`[data-node="${id}"] .node-header`).boundingBox(),plane=await page.locator('#plane').boundingBox(),scale=plane.width/820;await page.mouse.move(header.x+header.width/2,header.y+15);await page.mouse.down();await page.mouse.move(plane.x+x*scale+header.width/2,plane.y+y*scale+15,{steps:8});await page.mouse.up();}
 await moveNode(customId,350,10);
 async function drag(from,to){const a=await page.locator(from).boundingBox(),b=await page.locator(to).boundingBox();assert.ok(a&&b);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();}
 await drag(`[data-id="${sourceId}"][data-port="out"]`,`[data-id="${customId}"][data-port="u12"]`);
 assert.equal(await page.evaluate(()=>{const s=window.chaosLab.getState();return s.tabs[s.active].model.edges[0]?.port;}),'u12');
 const wirePoint=await page.locator('#plane [data-wire="0"]').evaluate(path=>{const point=path.getPointAtLength(path.getTotalLength()/2);const p=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM());return {x:p.x,y:p.y};});
 await page.mouse.click(wirePoint.x,wirePoint.y);
 await page.waitForSelector('[data-wire-end="to"]');
 await drag('[data-wire-end="to"]',`[data-id="${customId}"][data-port="u1"]`);
 assert.equal(await page.evaluate(()=>{const s=window.chaosLab.getState();return s.tabs[s.active].model.edges[0].port;}),'u1');
 const routedPoint=await page.locator('#plane [data-wire="0"]').evaluate(path=>{const point=path.getPointAtLength(path.getTotalLength()/2);const p=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM());return {x:p.x,y:p.y};});
 await page.mouse.move(routedPoint.x,routedPoint.y);await page.mouse.down();await page.mouse.move(routedPoint.x+40,routedPoint.y+45,{steps:8});await page.mouse.up();
 assert.ok(await page.evaluate(()=>{const s=window.chaosLab.getState();return s.tabs[s.active].model.edges[0].bend;}));
 await page.locator('[data-action="resetwire"]').click();
 assert.equal(await page.evaluate(()=>{const s=window.chaosLab.getState();return s.tabs[s.active].model.edges[0].bend;}),undefined);
 await page.locator(`[data-node="${customId}"] .node-title`).click();await page.locator('[data-action="addinput"]').click();
 assert.equal(await page.locator(`[data-node="${customId}"] .port.in`).count(),13);
 await page.locator('[data-custom-port-index="12"][data-custom-port-field="name"]').fill('temperature');await page.locator('[data-custom-port-index="12"][data-custom-port-field="name"]').press('Tab');
 assert.equal(await page.locator(`[data-id="${customId}"][data-port="temperature"]`).count(),1);
 await page.locator('[data-action="removeinput"][data-port-index="12"]').click();assert.equal(await page.locator(`[data-node="${customId}"] .port.in`).count(),12);
 assert.deepEqual(errors,[]);

 if(process.env.CHAOS_CAPTURE_DIR){await mkdir(process.env.CHAOS_CAPTURE_DIR,{recursive:true});await page.screenshot({path:process.env.CHAOS_CAPTURE_DIR+'/symbolic-workspace.png'});}
 await page.locator('[data-action="new"]').first().click();
 await page.locator('#new-template').selectOption('hydrogen');
 await page.locator('[data-action="newsubmit"]').click();
 await page.locator('.orbital-preview').click();
 const plot=page.locator('.orbital-stage canvas');
 const snapshot=()=>plot.evaluate(c=>c.toDataURL());
 const cloudImage=await snapshot();
 if(process.env.CHAOS_CAPTURE_DIR) await page.locator('.orbital-dialog').screenshot({path:process.env.CHAOS_CAPTURE_DIR+'/orbital-cloud.png'});
 await page.locator('#orbital-view').selectOption('slice');
 assert.notEqual(await snapshot(),cloudImage);
 const slice=await snapshot();
 await page.locator('#orbital-width').selectOption('2');
 assert.notEqual(await snapshot(),slice);
 const download=page.waitForEvent('download');
 await page.locator('[data-action="saveorbital"]').click();
 assert.equal((await download).suggestedFilename(),'orbital-slice.png');
 await page.locator('[data-action="closemodal"]').click();
 await page.locator('[data-node="radialTap"] .node-title').click();
 await page.locator('#enable-orbital').uncheck();
 assert.equal(await page.locator('.orbital-preview').count(),0);
 await page.locator('#enable-orbital').check();
 assert.equal(await page.locator('.orbital-preview').count(),1);
 assert.deepEqual(errors,[]);
 console.log('Chromium passed: orbital cloud, slice, scale, PNG download,  offline startup, symbolic laws, CDF histograms, seed isolation, parameter changes, final-law visualization, split view, Python/Julia downloads, Git commit, twelve named custom inputs, manual add/remove/rename, drag wiring, endpoint reconnection, and wire rerouting.');
 await context.close();
}finally{if(browser)await browser.close();server.kill();}
