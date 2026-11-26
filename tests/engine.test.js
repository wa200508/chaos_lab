import {hydrogenState} from '../src/hydrogen.js';
import legacyHydrogen from './fixtures/hydrogen-legacy.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileModel, defaultModel, makeNode, symbolic, toSysML, exportSymbolicGraph } from '../src/engine.js';
import { createDistributionRenderer, sampleFinalDistribution } from '../src/visualization.js';
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function graph(nodes,edges=[],iterations=1){return {name:'Test model',nodes,edges,iterations,samples:1000,seed:42};}
function source(op,id,params={}){const n=makeNode(op);n.id=id;Object.assign(n.params,params);return n;}
function operation(op,id,params={}){return source(op,id,params);}
function unary(op,params={}){const x=source('uniform','x'),y=operation(op,'y',params);return graph([x,y],[{from:'x',to:'y',port:'x'}]);}
const law=(m,id='y')=>{const a=compileModel(m);assert.deepEqual(a.errors,[]);return a.laws[id];};
test('compilation never draws randomness and ignores display seed/count',()=>{const m=defaultModel(),original=Math.random;Math.random=()=>{throw Error('RNG used by compiler');};try{const a=compileModel(m),b=compileModel({...m,seed:999,samples:50000});assert.deepEqual(exportSymbolicGraph(a),exportSymbolicGraph(b));assert.equal(a.values,undefined);assert.equal(a.laws.logistic.sourceIds.length,1);assert.equal(a.terms.size,16);}finally{Math.random=original;}});
test('a square derives the final CDF, including both inverse branches',()=>{const m=unary('custom',{expression:'x^2'}),y=law(m),renderer=createDistributionRenderer();close(renderer.cdf(y,.25),.5);const x=m.nodes[0];x.params.min=-1;close(createDistributionRenderer().cdf(law(m),.25),.5);});
test('logistic transfer uses every inverse branch',()=>{const y=law(unary('logistic',{r:4}));const renderer=createDistributionRenderer();close(renderer.cdf(y,.5),1-Math.sqrt(.5));close(renderer.cdf(y,1),1);close(renderer.cdf(y,-.1),0);});
test('shared X-X is a point mass, not two independent inputs',()=>{const x=source('normal','x'),sub=operation('subtract','y');const y=law(graph([x,sub],[{from:'x',to:'y',port:'x'},{from:'x',to:'y',port:'b'}]));assert.equal(y.term.kind,'constant');assert.equal(y.term.value,'0');assert.deepEqual(sampleFinalDistribution(createDistributionRenderer().render(y),100),Array(100).fill(0));});
test('a Gaussian sum preserves shared-source correlation',()=>{const x=source('normal','x'),z=source('normal','z'),sum=operation('add','y');let edges=[{from:'x',to:'y',port:'x'},{from:'x',to:'y',port:'b'}];let y=law(graph([x,z,sum],edges));assert.equal(y.cdf.variance,'4');edges[1].from='z';y=law(graph([x,z,sum],edges));assert.equal(y.cdf.variance,'2');});
test('independent uniforms convolve while shared uniforms scale',()=>{const x=source('uniform','x'),z=source('uniform','z'),sum=operation('add','y'),edges=[{from:'x',to:'y',port:'x'},{from:'z',to:'y',port:'b'}];let y=law(graph([x,z,sum],edges));close(createDistributionRenderer().cdf(y,.5),.125);edges[1].from='x';y=law(graph([x,z,sum],edges));close(createDistributionRenderer().cdf(y,.5),.25);});
test('joint finite logic preserves aliases',()=>{const x=source('bernoulli','x'),z=source('bernoulli','z'),and=operation('and','y'),edges=[{from:'x',to:'y',port:'x'},{from:'x',to:'y',port:'b'}];close(createDistributionRenderer().cdf(law(graph([x,z,and],edges)),0),.5);edges[1].from='z';close(createDistributionRenderer().cdf(law(graph([x,z,and],edges)),0),.75);});
test('calculus transforms symbolic expressions before deriving distributions',()=>{assert.equal(symbolic('x^3','differentiate'),'3*x^2');assert.equal(symbolic('2*x','integrate'),'x^2');close(createDistributionRenderer().cdf(law(unary('differentiate',{expression:'x^3'})),.75),.5);close(createDistributionRenderer().cdf(law(unary('integrate',{expression:'2*x'})),.25),.5);});
test('feedback unrolls laws and accumulation sums through time, not through samples',()=>{const m=defaultModel(),analysis=compileModel(m);assert.equal(analysis.errors.length,0);assert.deepEqual(analysis.laws.logistic.sourceIds,['random']);const accumulator=unary('accumulate');accumulator.iterations=3;const y=law(accumulator);assert.equal(y.term.linear.coefficients.x,'3');close(createDistributionRenderer().cdf(y,1.5),.5);});
test('histogram mass is evaluated from the final law and is normalized',()=>{const v=createDistributionRenderer().render(law(unary('power',{b:2})));assert.equal(v.status,'ready');close(v.histogram.counts.reduce((a,b)=>a+b,0),1);close(v.histogram.counts[0],Math.sqrt(1/34));assert.equal(v.approximation.deterministicQuadrature,false);});
test('generic joint integration is deterministic, restricted to visualization, and labeled',()=>{const x=source('uniform','x'),z=source('uniform','z'),product=operation('multiply','y');const y=law(graph([x,z,product],[{from:'x',to:'y',port:'x'},{from:'z',to:'y',port:'b'}]));assert.equal(y.cdf.kind,'pushforward');const renderer=createDistributionRenderer(),v=renderer.render(y);assert.equal(v.status,'ready');assert.equal(v.approximation.deterministicQuadrature,true);close(renderer.cdf(y,.25),.25-.25*Math.log(.25),.01);});
test('positive non-integer beta shapes are evaluated without a sampler',()=>{const x=source('beta','x',{a:.5,b:.5});close(createDistributionRenderer().cdf(law(graph([x]),'x'),.5),.5,1e-8);});
test('invalid graphs and expressions report errors without sample fallbacks',()=>{const m=unary('custom',{expression:'sin('});assert.ok(compileModel(m).errors.length);const cycle=unary('sin');cycle.edges=[{from:'y',to:'y',port:'x'}];assert.ok(compileModel(cycle).errors.some(e=>e.includes('unresolved cycle')));});
test('unrenderable real-domain cases retain their symbolic law',()=>{const m=unary('sqrt');m.nodes[0].params.min=-1;const y=law(m),v=createDistributionRenderer().render(y);assert.equal(y.kind,'symbolic-law');assert.equal(v.status,'symbolic-only');assert.match(v.error,/real domain/);});
test('SysML records the symbolic execution contract and source graph',()=>{const s=toSysML(defaultModel());assert.match(s,/symbolic-distributions\/v2/);assert.match(s,/connect random.output to logistic/);});
test('SysML preserves every declared custom input even when unconnected',()=>{const f=operation('custom','f',{expression:'a1+a12'});f.portMode='manual';f.inputPorts=Array.from({length:12},(_,i)=>({name:'a'+(i+1),default:'1/3'}));const text=toSysML(graph([f]));for(const p of f.inputPorts)assert.ok(text.includes(`port ${p.name} : ~Signal;`));assert.match(text,/Default: 1\/3/);assert.doesNotMatch(text,/port input :/);});
test('mixed-law atoms survive another noninvertible transform and final-law sampling',()=>{const x=source('uniform','x',{min:-1,max:1}),clamp=operation('clamp','clamp',{min:0,max:.5}),square=operation('power','y',{b:2});const y=law(graph([x,clamp,square],[{from:'x',to:'clamp',port:'x'},{from:'clamp',to:'y',port:'x'}]));const renderer=createDistributionRenderer();close(renderer.cdf(y,0),.5);close(renderer.cdf(y,.25),1);const samples=sampleFinalDistribution(renderer.render(y),10000);close(samples.filter(x=>x===0).length/samples.length,.5,.02);close(samples.filter(x=>x===.25).length/samples.length,.25,.02);});
test('a custom function with twelve named inputs preserves port identities and correlation',()=>{const inputs=Array.from({length:12},(_,i)=>source('uniform','u'+(i+1)));const custom=operation('custom','y',{expression:Array.from({length:12},(_,i)=>'a'+(i+1)).join('+')});custom.portMode='manual';custom.inputPorts=Array.from({length:12},(_,i)=>({name:'a'+(i+1),default:'0'}));const edges=inputs.map((n,i)=>({from:n.id,to:'y',port:'a'+(i+1)}));const y=law(graph([...inputs,custom],edges));assert.equal(y.sourceIds.length,12);assert.equal(Object.keys(y.term.linear.coefficients).length,12);close(createDistributionRenderer().cdf(y,6),.5,1e-7);edges.forEach(e=>e.from='u1');const shared=law(graph([...inputs,custom],edges));assert.equal(shared.sourceIds.length,1);});
test('undeclared variables on manually configured custom blocks are model errors',()=>{const m=unary('custom',{expression:'x+missing'});m.nodes[1].portMode='manual';m.nodes[1].inputPorts=[{name:'x',default:'0'}];assert.ok(compileModel(m).errors.some(e=>e.includes('Declare an input port')));});
test('custom feedback uses the explicit delay initial port and supports derived initial laws',()=>{const x=source('uniform','x'),initial=operation('custom','initial',{expression:'x^2'}),f=operation('custom','y',{expression:'2*state'}),delay=operation('delay','delay');const m=graph([x,initial,f,delay],[{from:'x',to:'initial',port:'x'},{from:'initial',to:'delay',port:'initial'},{from:'delay',to:'y',port:'state'},{from:'y',to:'delay',port:'x'}],2);close(createDistributionRenderer().cdf(law(m),1),.5);});
test('a tap can observe any named custom input, including an unconnected default',()=>{const f=operation('custom','y',{expression:'alpha+beta'});f.inputPorts=[{name:'alpha',default:'1/3'},{name:'beta',default:'2'}];f.portMode='manual';const tap=makeNode('tap');tap.id='tap';tap.source={id:'y',port:'in',inputPort:'alpha'};const a=compileModel(graph([f,tap]));assert.deepEqual(a.errors,[]);assert.equal(a.laws.tap.term.value,'1/3');});

test('hydrogen 1s amplitude and sphere probabilities agree at three probe radii', async () => {
  const model = structuredClone(legacyHydrogen);
  for (const r of [0, 1, 2]) {
    model.nodes.find(node => node.id === 'probe').params.value = r;
    const analysis = compileModel(model);
    assert.deepEqual(analysis.errors, []);
    const renderer = createDistributionRenderer();
    const enclosed = 1 - Math.exp(-2*r) * (1 + 2*r + 2*r*r);
    close(renderer.cdf(analysis.laws.radius, r), enclosed);
    close(renderer.render(analysis.laws.insideTap).stats.mean, enclosed);
    close(renderer.render(analysis.laws.radialTap).stats.mean, 1.5);
    close(renderer.render(analysis.laws.psi).stats.mean, Math.exp(-r)/Math.sqrt(Math.PI));
  }
});

test('orbital detections preserve the radial CDF and have isotropic directions', async () => {
  const {positions,cloudRate} = await import('../src/orbital-cloud.js');
  const law = compileModel(structuredClone(legacyHydrogen)).laws.radialTap;
  const rendered = createDistributionRenderer().render(law);
  assert.equal(cloudRate(law,rendered),2);
  const cloud = positions(rendered,30000,17);
  let inside=0;
  const squares=[0,0,0];
  for(const xyz of cloud){
    if(Math.hypot(...xyz)<1) inside++;
    xyz.forEach((v,i)=>squares[i]+=v*v);
  }
  close(inside/cloud.length,1-5*Math.exp(-2),.012);
  for(const sum of squares) close(sum/cloud.length,1,.06);
});

test('2p meridian tap retains its equatorial node and samples the angular Born law', async () => {
  const {meridianData} = await import('../src/meridian.js');
  const spec = {expression:'r*u*exp(-r/2)/sqrt(32*pi)', extent:12};
  const {density, points} = meridianData(spec, 8000, 42);
  assert.equal(density(2, 0), 0);
  assert.ok(Math.abs(density(0, 2) - Math.exp(-2)/(8*Math.PI)) < 1e-12);
  const cosineSquared = points.reduce((sum, [x,z,y]) => sum + z*z/(x*x+y*y+z*z), 0)/points.length;
  assert.ok(Math.abs(cosineSquared - 3/5) < 0.02);
});

test('the hydrogen operator graph responds to the Hamiltonian and quantum numbers', async()=>{
  const model=hydrogenState(2,1,0);
  const {meridianData,meridianSpec}=await import('../src/meridian.js');
  const get=id=>model.nodes.find(node=>node.id===id);
  const analyze=()=>{
    const a=compileModel(model);
    assert.deepEqual(a.errors,[]);
    const field=meridianData(meridianSpec(model,get('field'),a),8,42);
    return {density:field.density,energy:Number(createDistributionRenderer().render(a.laws.energy).stats.mean)};
  };
  const pz=analyze();
  close(pz.energy,-1/8);close(pz.density(2,0),0);
  close(pz.density(0,2),Math.exp(-2)/(8*Math.PI));
  get('basis').params.m=1;
  const ring=analyze();
  close(ring.density(0,2),0);close(ring.density(2,0),Math.exp(-2)/(16*Math.PI));
  get('potential').params.charge=2;
  const ion=analyze();
  close(ion.energy,-1/2);close(ion.density(1,0),8*ring.density(2,0));
  get('kinetic').params.mass=.5;
  close(analyze().energy,-1/4);
  model.edges=model.edges.filter(e=>e.from!=='potential');
  const broken=compileModel(model);
  assert.ok(broken.errors.length);assert.equal(broken.quantum.field,undefined);
});

test('the shared furnace cancels one temperature source only at equal thermal responses',async()=>{
 const {sharedFurnace}=await import('../src/furnace.js');
 const {subsystemBoundary}=await import('../src/quantities.js');
 const m=sharedFurnace(),a=compileModel(m);
 assert.deepEqual(a.errors,[]);
 assert.equal(a.laws.partA.cdf.variance,'17/5000');
 assert.equal(a.laws.partB.cdf.variance,'17/5000');
 assert.deepEqual(a.laws.difference.cdf,{kind:'normal',mean:'0',variance:'9/5000'});
 assert.deepEqual(a.quantities.tapDiff.canceled,['temperature']);
 assert.deepEqual(a.quantities.tapDiff.sources,['stockA','stockB']);
 assert.equal(a.quantities.tapDiff.units,'mm');
 assert.equal(subsystemBoundary(m,'Furnace').inputs.length,2);
 m.nodes.find(n=>n.id==='shiftB').params.b=.02;
 const changed=compileModel(m);
 assert.equal(changed.laws.difference.cdf.variance,'43/10000');
 assert.deepEqual(changed.quantities.tapDiff.canceled,[]);
 assert.ok(changed.quantities.tapDiff.sources.includes('temperature'));
});

test('conditional residuals, declarations and repeated wires keep their identities',()=>{
 const mu=source('normal','mean',{mean:3,sigma:2}),y=operation('conditionalNormal','conditional',{sigma:1});
 const x=operation('quantity','alias'),diff=operation('subtract','diff');
 const m=graph([mu,y,x,diff],[{from:'mean',to:'conditional',port:'mean'},{from:'conditional',to:'alias',port:'law'},
   {from:'alias',to:'diff',port:'x'},{from:'conditional',to:'diff',port:'b'}]);
 const a=compileModel(m);assert.deepEqual(a.errors,[]);
 assert.equal(a.laws.alias.term,a.laws.conditional.term);
 assert.equal(a.laws.alias.cdf.variance,'5');assert.equal(a.laws.diff.term.value,'0');
 assert.deepEqual(a.quantities.conditional.sources,['mean','conditional']);
 m.edges=m.edges.filter(e=>e.to!=='alias');
 const unbound=compileModel(m);assert.equal(unbound.quantities.alias.origin,'unbound');
 assert.equal(unbound.laws.alias,undefined);assert.ok(unbound.errors.length);
});

test('position is declared before solving and bound once to the derived joint law',()=>{
 const m=hydrogenState(2,1,1),a=compileModel(m);
 assert.deepEqual(a.errors,[]);assert.equal(m.nodes[0].id,'position');
 assert.equal(a.quantities.position.provider,'density');assert.equal(a.quantities.position.origin,'system');
 assert.equal(a.quantum.position.density,a.quantum.density.density);
 assert.deepEqual(a.quantities.field.sources,['position']);assert.equal(a.quantities.field.units,'a₀');
 m.edges=m.edges.filter(e=>e.port!=='observable');
 assert.equal(compileModel(m).quantum.field,undefined);
});

test('coupled balance equations solve for declared quantities over one joint set of sources',()=>{
 const nodes=[source('normal','T'),source('normal','S'),operation('linearSystem','balances',{matrix:'1,1;1,-1'}),
   operation('quantity','x'),operation('quantity','y'),operation('subtract','difference')];
 const pairs=[['T','balances','rhs1'],['S','balances','rhs2'],['x','balances','unknown1'],['y','balances','unknown2'],['x','difference','x'],['y','difference','b']];
 const m=graph(nodes,pairs.map(([from,to,port])=>({from,to,port})));
 const a=compileModel(m);assert.deepEqual(a.errors,[]);
 assert.deepEqual(a.laws.x.term.linear.coefficients,{T:'1/2',S:'1/2'});
 assert.deepEqual(a.laws.y.term.linear.coefficients,{T:'1/2',S:'-1/2'});
 assert.deepEqual(a.laws.difference.term.linear.coefficients,{S:'1'});
 assert.deepEqual(a.quantities.difference.canceled,['T']);
 nodes[2].params.matrix='1,1;2,2';
 const singular=compileModel(m);assert.ok(singular.errors.some(e=>e.includes('unique joint solution')));assert.equal(singular.laws.y,undefined);
});

test('the receiver tap laws reproduce the two-stage Friis noise factor as gain changes', async () => {
 const {rfReceiver} = await import('../src/rf-receiver.js');
 const model = rfReceiver();
 for (const gain of [4, 2, 1]) {
   model.nodes.find(n => n.id === 'lnaGain').params.b = gain;
   const {errors, laws, quantities} = compileModel(model);
   assert.deepEqual(errors, []);
   const expected = [
     ['inputLaw', 4, 1, ['thermal']],
     ['lnaLaw', 4 * gain, 1.25 * gain ** 2, ['thermal', 'lnaNoise']],
     ['outputLaw', 8 * gain, 5 * gain ** 2 + 16, ['thermal', 'lnaNoise', 'ifNoise']]
   ];
   for (const [id, mean, variance, sources] of expected) {
     const law = laws[id].cdf;
     assert.equal(law.kind, 'normal');
     assert.equal(Number(law.mean), mean);
     const [numerator, denominator = 1] = law.variance.split('/').map(Number);
     assert.equal(numerator / denominator, variance);
     assert.deepEqual(quantities[id].sources, sources);
   }
   const output = laws.outputLaw.cdf;
   const snrOut = Number(output.mean) ** 2 / Number(output.variance);
   assert.equal(16 / snrOut, 1.25 + (5 - 1) / gain ** 2);
 }
});

test('water-level retracker estimates from gate powers and retains probability at the near gate', async () => {
 const {waterLevelAltimeter} = await import('../src/water-level.js');
 const model = waterLevelAltimeter();
 function read() {
   const a = compileModel(model);
   assert.deepEqual(a.errors, []);
   const renderer = createDistributionRenderer();
   return {a, renderer, cdf: (tap, value) => renderer.cdf(a.laws[tap], value)};
 }
 const base = read();
 assert.deepEqual(base.a.quantities.rangeTap.sources.slice().sort(), ['peak','scatter']);
 // Independent integral over the gamma echo power and the Weibull background.
 close(base.cdf('rangeTap', 4), .048618904, .002);
 close(base.cdf('rangeTap', 4.3), .325932500, .002);
 close(base.cdf('heightTap', 1.7), 1-.325932500, .002);
 const plot = base.renderer.render(base.a.laws.rangeTap);
 assert.equal(plot.status, 'ready');
 close(plot.stats.mean, 4.323038675, .004);
 close(plot.stats.sd, .126267261, .003);
 const level = base.renderer.render(base.a.laws.heightTap);
 close(plot.stats.mean + level.stats.mean, 6);
 close(plot.stats.sd, level.stats.sd);
 close(base.cdf('heightTap', 2-1e-9), 1-base.cdf('rangeTap', 4), .00001);
 model.nodes.find(n=>n.id==='floor').params.b = 0;
 model.nodes.find(n=>n.id==='truth').params.value = 4.7;
 const clean = read();
 close(clean.cdf('rangeTap',4.69999),0);
 close(clean.cdf('rangeTap',4.70001),1);
 const exact = clean.renderer.render(clean.a.laws.rangeTap);
 close(exact.stats.mean, 4.7);
 close(exact.stats.sd, 0);
 for (const reading of sampleFinalDistribution(exact, 32, 42)) close(reading, 4.7);
});
