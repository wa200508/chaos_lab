import {readFile,writeFile,mkdir,readdir,copyFile,chmod,rm,stat,cp} from 'node:fs/promises';
import {resolve,join,basename,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inject} from 'postject';

const args=process.argv.slice(2),version=JSON.parse(await readFile('package.json','utf8')).version;
const platform=process.platform==='win32'?'windows':process.platform,arch=process.arch;
if(!['windows','linux'].includes(platform)||!['x64','arm64'].includes(arch))throw Error('Packaging supports native Windows/Linux x64 and arm64 builders.');
const out=resolve(args.includes('--out')?args[args.indexOf('--out')+1]:'releases'),work=resolve('.release-work'),stage=join(work,`chaos-lab-${version}-${platform}-${arch}`);
await mkdir(out,{recursive:true});await rm(work,{recursive:true,force:true});await mkdir(stage,{recursive:true});
const run=(command,argv,options={})=>{const r=spawnSync(command,argv,{stdio:'inherit',...options});if(r.status!==0)throw Error(`${command} failed (${r.status})`);};
const assets={};async function walk(dir){for(const name of await readdir(dir)){const file=join(dir,name);if((await stat(file)).isDirectory())await walk(file);else assets[file.replaceAll('\\','/')]=resolve(file);}}
await walk('dist');
const blob=join(work,'sea.blob'),config=join(work,'sea.json');
await writeFile(config,JSON.stringify({main:resolve('scripts/server.cjs'),output:blob,disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false,assets}));
run(process.execPath,['--experimental-sea-config',config]);
const executable=join(stage,platform==='windows'?'chaos-lab.exe':'chaos-lab');
await copyFile(process.execPath,executable);await chmod(executable,0o755);
if(platform==='windows'){
 // The modified preview executable is unsigned. Remove the base Node executable's
 // Authenticode directory before injecting the single-executable application.
 let pe=await readFile(executable);const start=pe.readUInt32LE(0x3c),optional=start+24;
 if(pe.toString('ascii',start,start+4)!=='PE\0\0')throw Error('Invalid PE executable.');
 const data=optional+(pe.readUInt16LE(optional)===0x20b?112:96),security=data+4*8;
 const offset=pe.readUInt32LE(security),size=pe.readUInt32LE(security+4);pe.fill(0,security,security+8);
 if(offset&&size&&offset+size===pe.length)pe=pe.subarray(0,offset);
 await writeFile(executable,pe);
}
await inject(executable,'NODE_SEA_BLOB',await readFile(blob),{sentinelFuse:'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'});
let nodeLicense;
for(const file of [join(dirname(process.execPath),'LICENSE'),resolve(dirname(process.execPath),'../LICENSE'),'/usr/share/doc/nodejs/copyright']){
 try{const text=await readFile(file,'utf8');if(text.includes('Node.js')&&text.includes('Permission is hereby granted')){nodeLicense=text;break;}}catch{}
}
if(!nodeLicense){
 const response=await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`Cannot retrieve the Node ${process.versions.node} license: HTTP ${response.status}`);
 nodeLicense=await response.text();
 if(!nodeLicense.includes('Node.js')||!nodeLicense.includes('Permission is hereby granted'))throw Error('Unexpected Node runtime license response.');
}
await writeFile(join(stage,'NODE-LICENSE.txt'),nodeLicense);
await copyFile('LICENSE',join(stage,'LICENSE'));await cp('export-environments',join(stage,'export-environments'),{recursive:true});
await writeFile(join(stage,'START-HERE.txt'),`Chaos Lab ${version}\n\nRun ${platform==='windows'?'chaos-lab.exe':'./chaos-lab'} to open http://127.0.0.1:4173.\nNo Node installation is required. Keep the process running while using the app.\nUse --no-open to suppress browser launch, --port NUMBER to choose a port.\nModels and Git history live in your browser profile, scoped to host and port.\nExport the Git repository before clearing browser data or switching origins.\nSee https://github.com/wa200508/chaos_lab for documentation and script-export dependencies.\n`);
let archive;
if(platform==='windows'){
 archive=join(out,basename(stage)+'.zip');
 const quote=s=>"'"+s.replaceAll("'","''")+"'";
 run('powershell.exe',['-NoProfile','-Command',`Compress-Archive -Path ${quote(join(stage,'*'))} -DestinationPath ${quote(archive)} -Force`]);
}else{
 archive=join(out,basename(stage)+'.tar.gz');run('tar',['-czf',archive,'-C',stage,'.']);
 if(args.includes('--linux-packages')){
   const root=join(work,'package-root'),binaryDir=join(root,'usr/lib/chaos-lab');
   for(const dir of [binaryDir,join(root,'usr/bin'),join(root,'usr/share/applications'),join(root,'usr/share/pixmaps'),join(root,'usr/share/doc/chaos-lab'),join(root,'DEBIAN')])await mkdir(dir,{recursive:true});
   await copyFile(executable,join(binaryDir,'chaos-lab'));await chmod(join(binaryDir,'chaos-lab'),0o755);
   await writeFile(join(root,'usr/bin/chaos-lab'),'#!/bin/sh\nexec /usr/lib/chaos-lab/chaos-lab "$@"\n');await chmod(join(root,'usr/bin/chaos-lab'),0o755);
   await copyFile('packaging/chaos-lab.desktop',join(root,'usr/share/applications/chaos-lab.desktop'));await copyFile('dist/icon.svg',join(root,'usr/share/pixmaps/chaos-lab.svg'));await copyFile('LICENSE',join(root,'usr/share/doc/chaos-lab/LICENSE'));
   const debVersion=version.replace('-','~'),debArch=arch==='x64'?'amd64':'arm64';
   await writeFile(join(root,'DEBIAN/control'),`Package: chaos-lab\nVersion: ${debVersion}\nArchitecture: ${debArch}\nMaintainer: Chaos Lab contributors\nDepends: libc6 (>= 2.28), libstdc++6, libgcc-s1\nRecommends: xdg-utils\nSection: science\nPriority: optional\nDescription: Symbolic probability systems studio\n Visual graph editor with distribution transforms and local Git history.\n`);
   run('dpkg-deb',['--root-owner-group','--build',root,join(out,`chaos-lab-${version}-ubuntu-${arch}.deb`)]);
   const rpmTop=join(work,'rpm');for(const dir of ['BUILD','BUILDROOT','RPMS','SOURCES','SPECS','SRPMS'])await mkdir(join(rpmTop,dir),{recursive:true});
   const spec=join(rpmTop,'SPECS/chaos-lab.spec'),rpmVersion=version.split('-')[0],release=version.includes('-')?'0.'+version.split('-').slice(1).join('.').replaceAll('-','.'): '1';
   await writeFile(spec,`Name: chaos-lab\nVersion: ${rpmVersion}\nRelease: ${release}%{?dist}\nSummary: Symbolic probability systems studio\nLicense: MIT\nURL: https://github.com/wa200508/chaos_lab\nRequires: glibc >= 2.28, libstdc++\nRecommends: xdg-utils\nAutoReqProv: no\n%global debug_package %{nil}\n%global __os_install_post %{nil}\n%description\nA visual graph editor with symbolic distribution transforms and local Git history.\n%install\nmkdir -p %{buildroot}\ncp -a ${JSON.stringify(join(root,'usr'))} %{buildroot}/\n%files\n/usr/bin/chaos-lab\n/usr/lib/chaos-lab/chaos-lab\n/usr/share/applications/chaos-lab.desktop\n/usr/share/pixmaps/chaos-lab.svg\n%license /usr/share/doc/chaos-lab/LICENSE\n`);
   run('rpmbuild',['--define',`_topdir ${rpmTop}`,'--define',`_build_id_links none`,'--target',arch==='x64'?'x86_64':'aarch64','-bb',spec]);
   async function findRpm(dir){for(const name of await readdir(dir)){const file=join(dir,name);if((await stat(file)).isDirectory())await findRpm(file);else if(name.endsWith('.rpm'))await copyFile(file,join(out,`chaos-lab-${version}-el9-${arch}.rpm`));}}
   await findRpm(join(rpmTop,'RPMS'));
 }
}
const files=(await readdir(out)).filter(name=>!name.startsWith('SHA256SUMS')).sort();
await writeFile(join(out,`SHA256SUMS-${platform}-${arch}.txt`),(await Promise.all(files.map(async name=>createHash('sha256').update(await readFile(join(out,name))).digest('hex')+'  '+name))).join('\n')+'\n');
console.log(JSON.stringify({version,platform,arch,executable,archive,out}));
