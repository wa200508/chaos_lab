import {matrixRows,solveBalances} from './constraints.js';
import nerdamer from 'nerdamer/all.js';
import {quantityTrace} from './quantities.js';
import {quantumOps,applyQuantum} from './quantum.js';
import {inputPorts} from './ports.js';
import {createLawFactory, ENGINE_VERSION} from './laws.js';
export {ENGINE_VERSION, exportSymbolicGraph} from './laws.js';
export const clone = o => JSON.parse(JSON.stringify(o));
export const CATALOG = [
 ['Random','Uniform','random','U','uniform'],['Random','Normal','random','N','normal'],['Random','Exponential','random','λ','exponential'],['Random','Bernoulli','random','B','bernoulli'],['Random','Poisson','random','P','poisson'],['Random','Gamma','random','Γ','gamma'],['Random','Beta','random','β','beta'],
 ['Quantities','Declare quantity','quantity','X','quantity'],['Quantities','Linear balances','constraint','A','linearSystem'],['Random','Conditional normal','conditional','N','conditionalNormal'],
 ['Functions','Logistic map','function','ƒ','logistic'],['Functions','Custom function','function','ƒ','custom'],['Functions','Tent map','function','⋀','tent'],['Functions','Sine','function','sin','sin'],['Functions','Cosine','function','cos','cos'],['Functions','Hyperbolic tangent','function','tanh','tanh'],['Functions','Exponential','function','eˣ','exp'],['Functions','Logarithm','function','ln','log'],['Functions','Square root','function','√','sqrt'],
 ['Math','Constant','parameter','#','constant'],['Math','Add','math','+','add'],['Math','Subtract','math','−','subtract'],['Math','Multiply','math','×','multiply'],['Math','Divide','math','÷','divide'],['Math','Power','math','xⁿ','power'],['Math','Absolute','math','|x|','abs'],['Math','Modulo','math','mod','modulo'],['Math','Minimum','math','min','min'],['Math','Maximum','math','max','max'],['Math','Clamp','math','⌈x⌉','clamp'],
 ['Calculus','Differentiate','calculus','∂','differentiate'],['Calculus','Integrate','calculus','∫','integrate'],['Calculus','Accumulate','calculus','Σ','accumulate'],
 ['Combinatorics','Factorial','combinatorics','n!','factorial'],['Combinatorics','Combination','combinatorics','nCr','combination'],['Combinatorics','Permutation','combinatorics','nPr','permutation'],
 ['Logic','Greater than','logic','>','greater'],['Logic','Less than','logic','<','less'],['Logic','Equal','logic','=','equal'],['Logic','AND','logic','∧','and'],['Logic','OR','logic','∨','or'],['Logic','NOT','logic','¬','not'],['Logic','Switch','logic','⇄','switch'],
 ['Dynamics','Unit delay','delay','z⁻¹','delay'],['Dynamics','Distribution tap','tap','▥','tap']
].map(([category,name,type,symbol,op])=>({category,name,type,symbol,op})).concat(Object.values(quantumOps));
export function makeNode(op,x=100,y=100) { const c=CATALOG.find(c=>c.op===op);if(op==='linearSystem')return {...c,id:'n'+crypto.randomUUID().slice(0,8),x,y,params:{matrix:'1,1;1,-1'},source:null};if(op==='quantity')return {...c,id:'n'+crypto.randomUUID().slice(0,8),x,y,params:{},units:'',domain:'real',source:null};if(quantumOps[op]){const {inputs,formula,params,...definition}=c;return {id:'n'+crypto.randomUUID().slice(0,8),...definition,x,y,params:{...params},source:null};}return {id:'n'+crypto.randomUUID().slice(0,8),...c,x,y,params:{...(op==='gamma'?{shape:3}:{}),value:op==='constant'?3.9:1,min:0,max:1,mean:0,sigma:1,lambda:1,p:0.5,r:op==='tent'?1.99:3.9,expression:op==='logistic'?'r*x*(1-x)':'x^2',a:2,b:2,steps:12,variable:'x'},source:null}; }
export function defaultModel(variant='logistic') {
 const nodes=[makeNode('uniform',46,141),makeNode('constant',303,24),makeNode('logistic',303,141),makeNode('delay',594,141),makeNode('tap',46,304),makeNode('tap',367,304)];
 nodes.forEach((n,i)=>n.id=['random','parameter','logistic','delay','inputTap','outputTap'][i]);nodes[1].name='Growth rate';nodes[1].params.value=3.9;nodes[2].name='Logistic map';nodes[4].name='Input distribution';nodes[4].source={id:'random',port:'out'};nodes[5].name='Output distribution';nodes[5].source={id:'logistic',port:'out'};
 return {id:crypto.randomUUID(),name:'Logistic exploration',engine:ENGINE_VERSION,branch:'main',nodes,edges:[{from:'random',to:'logistic',port:'x'},{from:'parameter',to:'logistic',port:'r'},{from:'logistic',to:'delay',port:'x'},{from:'delay',to:'logistic',port:'feedback'}],samples:10000,iterations:12,seed:42};
}
export function symbolic(expression,operation='simplify'){try {if(operation==='differentiate')return nerdamer.diff(expression,'x').toString();if(operation==='integrate')return nerdamer.integrate(expression,'x').toString();return nerdamer(expression).expand().toString();}catch{return 'Unable to resolve this expression';}}
export function stats(a){const v=a.filter(Number.isFinite);if(!v.length)return {mean:0,sd:0,min:0,max:0,n:0};let mean=v.reduce((a,b)=>a+b,0)/v.length;return {mean,sd:Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/v.length),min:Math.min(...v),max:Math.max(...v),n:v.length};}
export function histogram(a,bins=34){const s=stats(a),range=(s.max-s.min)||1,counts=Array(bins).fill(0);for(const x of a)if(Number.isFinite(x))counts[Math.min(bins-1,Math.floor((x-s.min)/range*bins))]++;return {counts,...s};}
// Compilation produces exact symbolic random-variable expressions and probability
// measures. Rendering and optional draws from final laws live in visualization.js.
export function compileModel(model) {
 const factory=createLawFactory(),outputs={},quantum={},errors=[],nodes=model.nodes.filter(n=>n.type!=='tap');
 const incoming=id=>model.edges.filter(e=>e.to===id),constant=factory.constant,delays=new Map(),sums=new Map();
 const bindings=new Map(),solutions=new Map();
 const providers=new Map(nodes.filter(n=>n.op==='born'||n.op==='linearSystem').map(n=>[n.id,n.op]));
 const binds=e=>(providers.get(e.to)==='born'&&e.port==='observable')||(providers.get(e.to)==='linearSystem'&&/^unknown[1-9]\d*$/.test(e.port));
 for(const edge of model.edges.filter(binds))bindings.set(edge.from,[...(bindings.get(edge.from)||[]),edge]);
 const stateEdge=(node,edge)=>edge.port==='feedback'&&!(node.op==='custom'&&inputPorts(node).some(p=>p.name==='feedback'));
 const activeEdges=node=>{const edges=incoming(node.id);
   if(providers.has(node.id))return edges.filter(e=>!binds(e));
   if(node.op==='quantity')return [...edges,...(bindings.get(node.id)||[]).map(e=>({from:e.to,to:node.id,port:'law',solution:e.port}))];
   if(node.op!=='custom')return edges;const used=new Set(nerdamer(node.params.expression).variables());return edges.filter(edge=>used.has(edge.port)||stateEdge(node,edge));};
 function expressionFor(node,get,step,previous=null){
   if(node.op==='quantity'){
     if(activeEdges(node).length!==1)throw Error('A declaration needs exactly one law provider.');
     return get('law');
   }
   if(node.op==='conditionalNormal'){
     if(!(Number(node.params.sigma)>0))throw Error('Conditional standard deviation must be positive.');
     const noise=factory.source(node.id,'normal',{mean:0,sigma:node.params.sigma});
     return factory.apply('add',{x:get('mean',node.params.mean??0),b:noise});
   }
   if(['custom','differentiate','integrate'].includes(node.op)){
     let expression=node.params.expression;
     if(node.op==='differentiate')expression=nerdamer.diff(expression,'x').toString();
     if(node.op==='integrate')expression=nerdamer.integrate(expression,'x').toString();
     const inputs=Object.fromEntries(inputPorts(node).map(port=>[port.name,port.name==='x'&&step>0&&previous?previous:get(port.name,port.default)]));
     return factory.apply('custom',inputs,expression);
   }
   const x=step>0&&previous?previous:get('x','1/2'),b=get('b',node.params.b??'2'),r=get('r',node.params.r??'39/10');
   if(node.op==='logistic'&&nerdamer('('+node.params.expression+')-(r*x*(1-x))').expand().toString()!=='0')return factory.apply('custom',{x,b,r},node.params.expression);
   if(node.op==='accumulate'){const term=factory.apply('add',{x:sums.get(node.id)||constant('0'),b:x});sums.set(node.id,term);return term;}
   const inputs={x};
   if(['logistic','tent'].includes(node.op))inputs.r=r;
   if(['add','subtract','multiply','divide','power','modulo','min','max','combination','permutation','greater','less','equal','and','or'].includes(node.op))inputs.b=b;
   if(node.op==='clamp'){inputs.min=get('min',node.params.min);inputs.max=get('max',node.params.max);}
   if(node.op==='switch'){inputs.p=constant(node.params.p);inputs.a=get('a',node.params.a);inputs.b=b;}
   return factory.apply(node.op,inputs);
 }
 for(const node of nodes)try{
   if(node.type==='random')outputs[node.id]=factory.source(node.id,node.op,node.params);
   if(node.type==='parameter')outputs[node.id]=constant(node.params.value);
   if(node.type==='delay')delays.set(node.id,constant(node.params.initial??'1/2'));
 }catch(error){errors.push(`${node.name}: ${error.message}`);}
 function balancedValues(node,edges,read){
         const matrix=matrixRows(node.params.matrix);
         const references=incoming(node.id).filter(binds);
         for(const edge of references){
           const variable=nodes.find(n=>n.id===edge.from);
           if(variable?.op!=='quantity'||variable.domain!=='real'||Number(edge.port.slice(7))>matrix.length)
             throw Error('Each unknown binds a declared real scalar.');
         }
         const rhs=matrix.map((_,i)=>{const edge=edges.find(e=>e.port==='rhs'+(i+1));
           if(!edge||!read(edge.from))throw Error('Connect a scalar right-hand side for every balance.');
           return read(edge.from);});
         return solveBalances(matrix,rhs,factory);
 }
 const initialCache=new Map(), initialSolutions=new Map();
 function initialLaw(id,visiting=new Set()){
   if(initialCache.has(id))return initialCache.get(id);
   if(outputs[id])return outputs[id];
   const node=nodes.find(n=>n.id===id);
   if(!node||visiting.has(id)||node.type==='delay'||node.op==='accumulate')throw Error('Initial-state law must resolve independently of feedback or accumulated state.');
   visiting=new Set([...visiting,id]);const edges=activeEdges(node);
   if(edges.some(e=>stateEdge(node,e)))throw Error('Initial-state law cannot depend on a feedback input.');
   const get=(port,fallback)=>{const edge=edges.find(e=>e.port===port);return edge?initialLaw(edge.from,visiting):constant(fallback);};
   let term;
   if(node.op==='linearSystem'){
     const values=balancedValues(node,edges,from=>initialLaw(from,visiting));
     initialSolutions.set(id,values);term=values[0];
   }else if(node.op==='quantity'&&edges.length===1&&edges[0].solution?.startsWith('unknown')){
     const provider=edges[0].from;
     initialLaw(provider,visiting);
     term=initialSolutions.get(provider)[Number(edges[0].solution.slice(7))-1];
   }else term=expressionFor(node,get,0);
   initialCache.set(id,term);return term;
 }
 for(const node of nodes.filter(n=>n.type==='delay')){const edge=incoming(node.id).find(e=>e.port==='initial');if(edge)try{delays.set(node.id,initialLaw(edge.from));}catch(error){errors.push(`${node.name}: ${error.message}`);}}
 const iterations=Math.min(100,Math.max(1,Math.trunc(Number(model.iterations)||1)));
 for(let step=0;step<iterations;step++){
   for(const [id,term]of delays)outputs[id]=term;
   const pending=nodes.filter(n=>!['random','parameter','delay'].includes(n.type)),done=new Set(nodes.filter(n=>['random','parameter','delay'].includes(n.type)&&outputs[n.id]).map(n=>n.id));
   for(let pass=0;pass<nodes.length&&pending.length;pass++)for(let j=pending.length-1;j>=0;j--){
     const node=pending[j];let edges;
     try{edges=activeEdges(node);}catch(error){if(step===0)errors.push(`${node.name}: ${error.message}`);pending.splice(j,1);delete outputs[node.id];continue;}
     const ordinary=edges.filter(e=>!stateEdge(node,e));if(ordinary.some(e=>!done.has(e.from)))continue;
     try{
       const get=(port,fallback)=>{const edge=ordinary.find(e=>e.port===port);return edge?outputs[edge.from]:constant(fallback);};
       const feedback=edges.find(e=>stateEdge(node,e));if(feedback&&!delays.has(feedback.from))throw Error('Feedback must pass through a Unit delay.');
       if(node.type==='quantum'){
         const inputs=Object.fromEntries(ordinary.map(e=>[e.port,quantum[e.from]]));
         const field=applyQuantum(node,inputs);
         if(node.op==='born'){
           const observable=incoming(node.id).find(e=>e.port==='observable');
           if(observable){
             const declaration=nodes.find(n=>n.id===observable.from);
             if(declaration?.op!=='quantity'||declaration.domain!=='space3')throw Error('Connect a three-dimensional position declaration.');
             if(declaration.units && declaration.units!=='a₀')throw Error('Position in this atomic-unit solver uses a₀.');
             field.observable=declaration.id;
           }
         }
         field.inputs=Object.fromEntries(ordinary.map(e=>[e.port,e.from]));
         quantum[node.id]=field;
         if(field.observable)field.inputs.observable=field.observable;
         if(field.scalar!==undefined)outputs[node.id]=constant(field.scalar);
       }else if(node.op==='linearSystem'){
         const values=balancedValues(node,ordinary,id=>outputs[id]);
         solutions.set(node.id,values);
         outputs[node.id]=values[0];
       }else if(node.op==='quantity'){
         if(ordinary.length!==1||ordinary[0].port!=='law')throw Error('A declaration needs exactly one law provider.');
         const provider=ordinary[0].from;
         if(node.domain==='space3'){
           if(quantum[provider]?.kind!=='born')throw Error('A spatial declaration requires a position probability law.');
           quantum[node.id]={...quantum[provider],inputs:{law:provider},observable:quantum[provider].observable||node.id};
         }else{
           const value=ordinary[0].solution?.startsWith('unknown')?solutions.get(provider)?.[Number(ordinary[0].solution.slice(7))-1]:outputs[provider];
           if(!value)throw Error('A real quantity requires a scalar law.');
           outputs[node.id]=value;
         }
       }else{
         if(ordinary.some(e=>quantum[e.from]&&!outputs[e.from]))throw Error('This port requires a scalar. Connect a quantum measurement first.');
         outputs[node.id]=expressionFor(node,get,step,feedback?outputs[feedback.from]:null);
       }
       done.add(node.id);
     }catch(error){if(step===0)errors.push(`${node.name}: ${error.message}`);delete outputs[node.id];}
     pending.splice(j,1);
   }
   if(step===0)for(const node of pending)errors.push(`${node.name}: unresolved cycle or missing input (use a Unit delay for feedback).`);
   for(const node of nodes.filter(n=>n.type==='delay')){const edge=incoming(node.id).find(e=>e.port==='x');if(edge&&outputs[edge.from])delays.set(node.id,outputs[edge.from]);}
 }
 for(const node of model.nodes.filter(n=>n.type==='tap'))try{
   const source=node.source;
   if(source?.port==='in'){
     const name=source.inputPort||'x',edge=model.edges.find(e=>e.to===source.id&&e.port===name);
     if(edge){outputs[node.id]=outputs[edge.from];if(quantum[edge.from])quantum[node.id]=quantum[edge.from];}else{const target=nodes.find(n=>n.id===source.id),port=target&&inputPorts(target).find(p=>p.name===name);if(port&&target.type!=='quantum'&&target.op!=='quantity')outputs[node.id]=constant(port.default);}
   }else if(source){outputs[node.id]=outputs[source.id];if(quantum[source.id])quantum[node.id]=quantum[source.id];}
 }catch(error){errors.push(`${node.name}: ${error.message}`);}
 const laws=Object.fromEntries(Object.entries(outputs).filter(([,term])=>term).map(([id,term])=>[id,factory.law(term)]));
 return {engine:ENGINE_VERSION,laws,quantum,quantities:quantityTrace(model,laws,quantum,bindings),terms:factory.terms,errors,iterations};
}
// Backwards-compatible name; this now compiles laws and never generates samples.
export const simulate=compileModel;
export function toSysML(model){const id=s=>String(s).replace(/[^a-zA-Z0-9_]/g,'_'),doc=s=>String(s).replaceAll('*/','* /');let source=`package ${id(model.name)} {\n    private import ScalarValues::*;\n    doc /* Engine: ${ENGINE_VERSION}. Ports denote symbolic random variables; numerical evaluation occurs only at visualization taps. */\n\n    port def Signal {\n        out item value : Real;\n    }\n\n    part def Block {\n        port output : Signal;\n    }\n\n    item def QuantumValue;\n    port def QuantumSignal { out item value : QuantumValue; }\n    part def QuantumBlock { port output : QuantumSignal; }\n\n    part model {\n        attribute visualizationDrawCount : Integer = ${model.samples};\n        attribute iterations : Integer = ${model.iterations};\n        attribute visualizationSeed : Integer = ${model.seed};\n`;
 const sourceOf=tap=>{
   const port=tap.source;
   if(port?.port==='in')return model.edges.find(e=>e.to===port.id&&e.port===(port.inputPort||'x'))?.from;
   return port?.id;
 };
 const spatial=n=>n?.domain==='space3'||(n?.type==='quantum'&&!['sphereMass','eigenenergy'].includes(n.op));
 const groups=[...new Set(model.nodes.map(n=>n.subsystem||''))];
 const paths=new Map();
 for(const [index,group] of groups.entries()){
 const scope='subsystem_'+index;
 if(group)source+=`\n        part ${scope} {\n            doc /* ${doc(group)} */\n`;
 for(const n of model.nodes.filter(n=>(n.subsystem||'')===group)){
 paths.set(n.id,(group?scope+'.':'')+id(n.id));let ports;try{ports=inputPorts(n);}catch{ports=(n.inputPorts||[]).map(p=>typeof p==='string'?{name:p}:p);}const portNames=new Set([...ports.map(p=>p.name),...model.edges.filter(e=>e.to===n.id).map(e=>e.port)]);source+=`\n        part ${id(n.id)} : ${spatial(n)?'QuantumBlock':'Block'} {\n            doc /* ${doc(n.name)} | ${doc(n.op)} */\n`;if(n.op==='linearSystem')source+=`            doc /* A x = b, coefficient rows: ${doc(n.params.matrix)}. Unknown ports bind declared quantities. */\n`;if(n.units||n.domain)source+=`            doc /* Quantity domain ${doc(n.domain||'real')}, units ${doc(n.units||'unspecified')}. */\n`;for(const [k,v]of Object.entries(n.params)){if(typeof v==='number')source+=`            attribute ${portNames.has(k)?'default_':''}${id(k)} : Real = ${v};\n`;}for(const name of portNames){const port=ports.find(p=>p.name===name);source+=`            port ${id(name)} : ~${n.type==='quantum'||n.domain==='space3'?'QuantumSignal':'Signal'};\n`;if(port)source+=`            doc /* ${id(name)}: ${doc(port.description||port.label||name)} Default: ${doc(port.default??'0')}. */\n`;}if(['function','calculus'].includes(n.type))source+=`            doc /* expression: ${doc(n.params.expression)} */\n`;if(n.type==='tap')source+=`            port observation : ~${spatial(model.nodes.find(s=>s.id===sourceOf(n)))?'QuantumSignal':'Signal'};\n`;if(n.source)source+=`            doc /* Visualization observes ${doc(n.source.id)}.${doc(n.source.port==='in'?n.source.inputPort||'x':'output')}. */\n`;source+='        }\n';}
 if(group)source+='        }\n';
 }
 for(const e of model.edges)source+=`\n        connect ${paths.get(e.from)}.output to ${paths.get(e.to)}.${id(e.port)};`;
 for(const tap of model.nodes.filter(n=>n.type==='tap')){
   const from=paths.get(sourceOf(tap));
   if(from)source+=`\n        connect ${from}.output to ${paths.get(tap.id)}.observation;`;
 }
 return source+'\n    }\n}\n';}
