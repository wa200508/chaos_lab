#!/usr/bin/env node
'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const sea=require('node:sea');
const embedded=sea.isSea();
const args=process.argv.slice(2);
if(args.includes('--help')){console.log('Chaos Lab\nUsage: chaos-lab [--host 127.0.0.1] [--port 4173] [--open | --no-open]\nModels are stored in your browser, not in the server process.');process.exit(0);}
const flag=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const host=flag('--host',process.env.CHAOS_LAB_HOST||'127.0.0.1');
const rawPort=flag('--port',process.env.PORT||'4173');
if(!/^\d+$/.test(rawPort)||+rawPort>65535||!host||!/^[a-zA-Z0-9.:-]+$/.test(host)){console.error('Invalid host or port.');process.exit(1);}
const staticRoot=path.resolve(__dirname,'../dist');
function asset(name){if(embedded)return Buffer.from(sea.getAsset('dist/'+name));const file=path.resolve(staticRoot,name);if(!file.startsWith(staticRoot+path.sep))throw Error('Outside static root');return fs.readFileSync(file);}
let version;try{version=JSON.parse(asset('version.json').toString());}catch{console.error('Build the application first with npm run build.');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/'||name==='/index.html')name='index.html';else name=name.slice(1);if(name.includes('\\')||name.split('/').includes('..')||name.includes('\0'))throw Error('Invalid path');}catch{res.writeHead(400);res.end('Invalid path');return;}
 if(name==='healthz'){const body=JSON.stringify({status:'ok',...version});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);return;}
 try{const data=asset(name);res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${rawPort} is already in use. Choose another with --port.`:error.message);process.exitCode=1;});
server.listen(+rawPort,host,()=>{
 const publicHost=['0.0.0.0','::'].includes(host)?'127.0.0.1':host;
 const url=`http://${publicHost.includes(':')?'['+publicHost+']':publicHost}:${server.address().port}`;
 console.log(`Chaos Lab ${version.version}\n${url}\nPress Ctrl+C to stop. Browser storage keeps your models.`);
 if(!args.includes('--no-open')&&(embedded||args.includes('--open'))){
   const command=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
   const child=spawn(command[0],command[1],{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();
 }
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
