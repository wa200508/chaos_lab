import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const version=JSON.parse(readFileSync('package.json','utf8')).version;const platform=process.platform==='win32'?'windows':process.platform;const name=process.argv[2]||`.release-work/chaos-lab-${version}-${platform}-${process.arch}/chaos-lab${platform==='windows'?'.exe':''}`;
const r=spawnSync(process.execPath,['--test','tests/server.test.js'],{stdio:'inherit',env:{...process.env,CHAOS_LAB_BINARY:resolve(name)}});process.exitCode=r.status;
