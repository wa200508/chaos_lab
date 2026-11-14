import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultModel} from '../src/engine.js';
import {exportPayload,generateScript} from '../src/exporters/index.js';
test('both script formats contain the complete symbolic system and every visualization node',()=>{const m=defaultModel(),payload=exportPayload(m);assert.equal(payload.visualizations.length,2);assert.equal(payload.graph.engine,'symbolic-distributions/v2');assert.equal(payload.graph.outputs.logistic.definition.joint.sourceIds.length,1);for(const language of ['python','julia']){const script=generateScript(m,language);assert.ok(script.includes('--no-plot'));assert.ok(script.includes('symbolic_cdf'));assert.ok(script.includes('plot_visualizations'));assert.ok(script.includes(Buffer.from(JSON.stringify(payload)).toString('base64')));}});
test('script export preserves data safely even with quotes and newline characters in model names',()=>{const m=defaultModel();m.name='"""\n`quoted ${name}`';const script=generateScript(m,'python');const encoded=script.match(/b64decode\("([A-Za-z0-9+/=]+)"\)/)[1];assert.equal(JSON.parse(Buffer.from(encoded,'base64').toString()).model.name,m.name);});
