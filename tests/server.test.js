import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const binary=process.env.CHAOS_LAB_BINARY;
test('local launcher serves the bundled app and health endpoint without exposing source files',async()=>{
 const child=spawn(binary||process.execPath,binary?['--port','0','--no-open']:['scripts/server.cjs','--port','0','--no-open'],{stdio:['ignore','pipe','pipe']});
 let output='';const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server failed to start: '+output)),15000);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});child.stderr.on('data',chunk=>output+=chunk);child.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+output));});});
 try{
 const health=await(await fetch(url+'/healthz')).json();assert.equal(health.status,'ok');assert.equal(health.engine,'symbolic-distributions/v2');
 const index=await(await fetch(url)).text();assert.match(index,/Chaos Lab/);assert.match(index,/app\.js\?v=/);
 const js=await fetch(url+'/app.js');assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
 assert.equal((await fetch(url+'/package.json')).status,404);assert.equal((await fetch(url+'/src/engine.js')).status,404);assert.equal((await fetch(url+'/index.html',{method:'POST'})).status,405);
 }finally{child.kill();}
});
