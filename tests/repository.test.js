import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window=globalThis;
const repo=await import('../src/repository.js');
test('real Git history supports branches, model snapshots and repository export',async()=>{const oid=await repo.initRepository();assert.match(oid,/^[a-f0-9]{40}$/);const m=await repo.readModel(oid);assert.equal(m.name,'Logistic exploration');const history=await repo.history();assert.equal(history.length,5);assert.deepEqual((await repo.branches()).sort(),['edge-of-chaos','main']);const old=await repo.readModel(await repo.head('edge-of-chaos'));assert.notEqual(old.nodes.find(n=>n.id==='parameter').params.value,m.nodes.find(n=>n.id==='parameter').params.value);await repo.newBranch('test-design',oid);m.branch='test-design';m.name='Copied exploration';const next=await repo.commitModel(m,m.branch,m.name);assert.notEqual(next,oid);assert.equal((await repo.readModel(next)).name,m.name);const tar=await repo.exportRepository();assert.ok(tar.size>1000);const fs=await import('node:fs/promises');await fs.writeFile('/tmp/chaos-repository-test.tar',Buffer.from(await tar.arrayBuffer()));});
