import git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';
import {clone,defaultModel,toSysML,compileModel,exportSymbolicGraph,ENGINE_VERSION} from './engine.js';
export const libraryKey=new URLSearchParams(globalThis.location?.search||'').get('library')||'';
const fs=new LightningFS(libraryKey?'chaos-models-'+libraryKey:'chaos-lab-git-v2'),pfs=fs.promises,dir='/models',author={name:'You',email:'explorer@chaos.local'};
const safeName=n=>n.replace(/[^a-zA-Z0-9_-]/g,'_');
export async function branches(){return git.listBranches({fs,dir});}
export async function commitModel(model,branch=model.branch||'main',message=model.name){
 if(libraryKey)await git.checkout({fs,dir,ref:branch,force:true});
 await git.writeRef({fs,dir,ref:'HEAD',value:'refs/heads/'+branch,force:true,symbolic:true});
 const stored={...model,engine:ENGINE_VERSION};
 await pfs.writeFile(dir+'/model.json',JSON.stringify(stored,null,2),'utf8');
 await pfs.writeFile(dir+'/model.symbolic.json',JSON.stringify(exportSymbolicGraph(compileModel(stored)),null,2),'utf8');
 await git.add({fs,dir,filepath:'model.symbolic.json'});await pfs.writeFile(dir+'/model.sysml',toSysML(model),'utf8');
 await git.add({fs,dir,filepath:'model.json'});await git.add({fs,dir,filepath:'model.sysml'});
 return git.commit({fs,dir,ref:'refs/heads/'+branch,author,message:message+`\n\nModel: ${model.name}\nBlocks: ${model.nodes.length}\nEngine: ${ENGINE_VERSION}\nVisualization draws: ${model.samples}\nVisualization seed: ${model.seed}\nFormat: SysML 2.0 + graph JSON`});
}
// Import the original Git objects so commit IDs and ancestry match the checkout.
async function loadLibrary() {
 const response=await fetch('/model-library.json',{cache:'no-store'});
 if(!response.ok)throw Error('The model repository launcher is required.');
 const {refs,pack}=await response.json();
 if(!refs.main)throw Error('Model repository needs a main branch.');
 try{await pfs.stat(dir);}catch{await pfs.mkdir(dir);}
 try{await pfs.stat(dir+'/.git');}catch{await git.init({fs,dir,defaultBranch:'main'});}
 const bytes=Uint8Array.from(atob(pack),ch=>ch.charCodeAt(0));
 const hash=Array.from(bytes.slice(-20),n=>n.toString(16).padStart(2,'0')).join('');
 const filepath='.git/objects/pack/pack-'+hash+'.pack';
 try{await pfs.stat(dir+'/'+filepath.replace(/pack$/, 'idx'));}catch{
   await pfs.writeFile(dir+'/'+filepath,bytes);
   await git.indexPack({fs,dir,filepath});
 }
 const local=new Set(await branches());
 for(const [branch,oid] of Object.entries(refs)){
   if(!local.has(branch)) await git.branch({fs,dir,ref:branch,object:oid});
   else {
     const ancestor=await head(branch);
     if(ancestor!==oid && await git.isDescendent({fs,dir,oid,ancestor}))
       await git.writeRef({fs,dir,ref:'refs/heads/'+branch,value:oid,force:true});
   }
 }
 const branch=await git.currentBranch({fs,dir})||'main';
 await git.checkout({fs,dir,ref:branch,force:true});
 return head('main');
}
export async function initRepository(){
 if(libraryKey)return loadLibrary();
 try{await pfs.stat(dir+'/.git');}catch{
 await pfs.mkdir(dir);await git.init({fs,dir,defaultBranch:'main'});
 let m=defaultModel();m.nodes.find(n=>n.id==='parameter').params.value=3.4;await commitModel(m,'main','Initial logistic system');
 m.nodes.find(n=>n.id==='parameter').params.value=3.55;await commitModel(m,'main','Find the period-doubling boundary');
 const base=await git.resolveRef({fs,dir,ref:'main'});await git.branch({fs,dir,ref:'edge-of-chaos',object:base});
 const exp=clone(m);exp.branch='edge-of-chaos';exp.nodes.find(n=>n.id==='parameter').params.value=3.56995;await commitModel(exp,exp.branch,'Explore the edge of chaos');
 m.nodes.find(n=>n.id==='parameter').params.value=3.8;await commitModel(m,'main','Add live distribution taps');
 m.nodes.find(n=>n.id==='parameter').params.value=3.9;await commitModel(m,'main','Explore the chaotic regime');
 }
 return head('main');
}
export async function head(branch){return git.resolveRef({fs,dir,ref:branch});}
export async function readModel(oid){const {blob}=await git.readBlob({fs,dir,oid,filepath:'model.json'});return JSON.parse(new TextDecoder().decode(blob));}
export async function history(){
 const refs=(await branches()).sort((a,b)=>a==='main'?-1:b==='main'?1:a.localeCompare(b)),all=new Map();
 for(const branch of refs){const logs=await git.log({fs,dir,ref:branch,depth:100});for(const l of logs){if(all.has(l.oid)){all.get(l.oid).branches.push(branch);continue;}all.set(l.oid,{...l,branch,branches:[branch],order:all.size});}}
 const result=[],seen=new Set(),items=[...all.values()];
 while(result.length<items.length){const ready=items.filter(c=>!seen.has(c.oid)&&!items.some(child=>!seen.has(child.oid)&&child.commit.parent.includes(c.oid))).sort((a,b)=>b.commit.author.timestamp-a.commit.author.timestamp||a.order-b.order);if(!ready.length)break;const next=ready[0];seen.add(next.oid);result.push(next);}
 return result;
}
export async function newBranch(name,oid){if(!/^[a-zA-Z0-9][a-zA-Z0-9_/-]*$/.test(name)||name.includes('..')||name.endsWith('/'))throw Error('Use letters, numbers, dashes, and slashes for the branch name.');await git.branch({fs,dir,ref:name,object:oid});return name;}
export async function exportRepository(){
 const entries=[];async function walk(path,base){for(const name of await pfs.readdir(path)){const target=path+'/'+name,s=await pfs.stat(target);if(s.isDirectory())await walk(target,base+name+'/');else entries.push({name:base+name,data:await pfs.readFile(target)});}}
 await walk(dir,'chaos-lab/');
 const out=[];const enc=new TextEncoder();for(const e of entries){const header=new Uint8Array(512);const put=(offset,len,str)=>header.set(enc.encode(str).subarray(0,len),offset);put(0,100,e.name);put(100,8,'0000644\0');put(108,8,'0000000\0');put(116,8,'0000000\0');put(124,12,e.data.length.toString(8).padStart(11,'0')+'\0');put(136,12,Math.floor(Date.now()/1000).toString(8).padStart(11,'0')+'\0');put(148,8,'        ');put(156,1,'0');put(257,6,'ustar\0');put(263,2,'00');const sum=header.reduce((a,b)=>a+b,0);put(148,8,sum.toString(8).padStart(6,'0')+'\0 ');out.push(header,e.data,new Uint8Array((512-e.data.length%512)%512));}out.push(new Uint8Array(1024));return new Blob(out,{type:'application/x-tar'});
}
