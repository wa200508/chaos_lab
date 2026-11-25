import {matrixRows} from './constraints.js';
import {quantumOps} from './quantum.js';
import nerdamer from 'nerdamer/all.js';
const reserved=new Set(['pi','e','E','sin','cos','tan','tanh','exp','log','sqrt','abs','factorial','gamma']);
export function validatePortName(name){if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||reserved.has(name))throw Error('Use a unique variable name such as x, temperature, or input12. Function names and mathematical constants are reserved.');return name;}
export function expressionVariables(expression){return nerdamer(expression).variables().sort(new Intl.Collator('en',{numeric:true}).compare);}
const fallback=(node,name)=>name==='x'?'1/2':name==='initial'?String(node.params?.initial??'1/2'):String(node.params?.[name]??0);
export function customInputPorts(node){
 const previous=node.inputPorts||[];
 const names=node.portMode==='manual'?previous.map(p=>typeof p==='string'?p:p.name):expressionVariables(node.params.expression);
 const seen=new Set();
 return names.map(name=>{validatePortName(name);if(seen.has(name))throw Error('Each input port needs a unique name.');seen.add(name);const old=previous.find(p=>(typeof p==='string'?p:p.name)===name);return {name,label:typeof old==='object'&&old.label?old.label:name,default:typeof old==='object'&&old.default!==undefined?String(old.default):fallback(node,name),description:`Input variable ${name}. Its wire carries a symbolic random variable; the default is used when unconnected.`};});
}
export function inputPorts(node){
 if(node.op==='linearSystem'){
   const rows=matrixRows(node.params.matrix);
   return [...rows.map((_,i)=>({name:'rhs'+(i+1),label:'b'+(i+1),description:'Right-hand side of balance '+(i+1),default:'required'})),
     ...rows.map((_,i)=>({name:'unknown'+(i+1),label:'x'+(i+1),description:'Declaration determined by this solution component.',default:'anonymous'}))];
 }
 if(node.op==='quantity')return [{name:'law',label:'law',description:'Bind an existing law to this declaration.',default:'unbound'}];
 if(node.op==='conditionalNormal')return [{name:'mean',label:'mean',description:'Conditional mean. Each instance contributes independent Gaussian noise.',default:String(node.params.mean??0)}];
 if(quantumOps[node.op])return Object.entries(quantumOps[node.op].inputs).map(([name,kind])=>({name,label:name,description:'Required '+quantumOps[kind].name+' output.',default:'required'})).concat(node.op==='born'?[{name:'observable',label:'quantity',description:'Spatial quantity whose position law this operator determines.',default:'anonymous position'}]:[]);
 if(node.op==='custom')return customInputPorts(node);
 const make=(name,label,description)=>({name,label,description,default:fallback(node,name)});
 if(['random','parameter','tap'].includes(node.type))return [];
 if(node.type==='calculus')return [...new Set(['x',...expressionVariables(node.params.expression)])].map(name=>make(name,name,name==='x'?'Distribution to transform using the symbolic operator.':`Parameter ${name} in the operator expression.`));
 if(['logistic','tent'].includes(node.op))return [make('x','state x','Initial-state distribution. A feedback connection replaces it after the first iteration.'),make('r','growth r','Growth-rate parameter or symbolic random variable.'),make('feedback','previous x','State from a Unit delay, used after the initial iteration.')];
 if(node.type==='delay')return [make('x','next x','The law to retain for the next iteration.'),make('initial','initial x','Initial-state law. Defaults to the initial constant in this block.')];
 if(node.op==='clamp')return [make('x','value x','Distribution to clamp.'),make('min','lower','Lower clamp boundary.'),make('max','upper','Upper clamp boundary.')];
 if(node.op==='switch')return [make('x','test x','Compare this variable with the threshold.'),make('a','if true','Value or distribution used when the test is true.'),make('b','if false','Value or distribution used when the test is false.')];
 if(['add','subtract','multiply','divide','power','modulo','min','max','combination','permutation','greater','less','equal','and','or'].includes(node.op))return [make('x','x','First operand: a symbolic random variable.'),make('b','b','Second operand. The inspector default is used when unconnected.')];
 return [make('x',node.type==='delay'?'previous x':'x',node.type==='delay'?'Value retained for the next symbolic iteration.':'Input distribution for this transformation.')];
}
export function inputPortY(node,name){
 if(['logistic','tent'].includes(node.op)&&name==='r')return 0;
 const ports=inputPorts(node).filter(p=>!(['logistic','tent'].includes(node.op)&&p.name==='r'));
 const index=ports.findIndex(port=>port.name===name);
 return (node.op==='custom'?88:70)+Math.max(0,index)*(node.op==='custom'?22:24);
}
