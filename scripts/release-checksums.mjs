import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const directory=process.argv[2]||'releases';
const names=(await readdir(directory)).filter(name=>!name.startsWith('SHA256SUMS')).sort();
await writeFile(join(directory,'SHA256SUMS.txt'),(await Promise.all(names.map(async name=>createHash('sha256').update(await readFile(join(directory,name))).digest('hex')+'  '+name))).join('\n')+'\n');
