import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const directory=process.argv[2]||'docs/screenshots';await mkdir(directory,{recursive:true});
const child=spawn(process.execPath,['scripts/server.cjs','--port','0','--no-open'],{stdio:['ignore','pipe','inherit']});
const url=await new Promise(resolve=>{let s='';child.stdout.on('data',chunk=>{s+=chunk;const match=s.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});
try{
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:2});await page.goto(url);await page.waitForFunction(()=>window.chaosLab);await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:directory+'/logistic-map-workspace.png'});
await page.locator('[data-action="analytics"]').first().click();await page.locator('[data-action="expandgit"]').click();await page.locator('[data-action="zoomout"]').click();await page.locator('[data-action="zoomout"]').click();
await page.screenshot({path:directory+'/chaotic-simulation.png'});
await page.locator('[data-param="r"]').fill('3.2');await page.locator('[data-param="r"]').press('Tab');
await page.screenshot({path:directory+'/period-two-simulation.png'});
await page.locator('[data-action="new"]').click();await page.locator('#new-name').fill('Twelve inputs, one random variable');await page.locator('#new-template').selectOption('empty');await page.locator('[data-action="newsubmit"]').click();
await page.waitForFunction(()=>{const s=window.chaosLab.getState();return s.tabs[s.active].model.name==='Twelve inputs, one random variable';});
await page.locator('[data-action="expandgit"]').click();await page.locator('[data-action="fit"]').click();await page.locator('[data-action="git"]').first().click();
async function moveNode(id,x,y){const h=await page.locator(`[data-node="${id}"] .node-header`).boundingBox(),p=await page.locator('#plane').boundingBox(),scale=p.width/820;await page.mouse.move(h.x+h.width/2,h.y+15);await page.mouse.down();await page.mouse.move(p.x+x*scale+h.width/2,p.y+y*scale+15,{steps:8});await page.mouse.up();}
await page.locator('#block-search').fill('Uniform');await page.locator('[data-block="uniform"]').dblclick();const source=await page.evaluate(()=>window.chaosLab.getState().selected);await moveNode(source,10,10);
await page.locator('#block-search').fill('Custom function');await page.locator('[data-block="custom"]').dblclick();const custom=await page.evaluate(()=>window.chaosLab.getState().selected);
await page.locator('#expression').fill(Array.from({length:12},(_,i)=>'u'+(i+1)).join('+'));await page.locator('#expression').press('Tab');await moveNode(custom,300,10);
for(let i=1;i<=12;i++){await page.locator(`[data-id="${source}"][data-port="out"]`).click();await page.locator(`[data-id="${custom}"][data-port="u${i}"]`).click();}
await page.locator(`[data-node="${custom}"] .node-title`).click();await page.locator('[data-action="tapselection"]').click();await page.locator(`[data-node="${custom}"] .node-title`).click();
await page.locator('#block-search').fill('');
await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('visible'));await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
await page.screenshot({path:directory+'/custom-twelve-inputs.png'});
console.log('Captured symbolic workspace, analytic distributions, period-two law, and twelve named inputs.');
}finally{await browser.close();child.kill();}
