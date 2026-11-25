import {sharedFurnace} from '../src/furnace.js';
import {hydrogenState} from '../src/hydrogen.js';
import legacyHydrogen from '../tests/fixtures/hydrogen-legacy.json' with {type:'json'};
import {mkdir,writeFile} from 'node:fs/promises';
import {makeNode,defaultModel} from '../src/engine.js';
import {generateScript} from '../src/exporters/index.js';
const out=process.argv[2]||'.export-test';await mkdir(out,{recursive:true});
function fixture(kind){const x=makeNode('uniform'),y=makeNode(kind==='difference'?'subtract':'custom'),tap=makeNode('tap');x.id='x';y.id='y';tap.id='tap';tap.name='Output distribution';tap.source={id:'y',port:'out'};y.params.expression='x^2';const edges=[{from:'x',to:'y',port:'x'}];if(kind==='difference')edges.push({from:'x',to:'y',port:'b'});return{name:kind,nodes:[x,y,tap],edges,iterations:1,samples:1000,seed:42};}
const twelveSources=Array.from({length:12},(_,i)=>({...makeNode('normal'),id:'n'+(i+1)})),twelveFunction={...makeNode('custom'),id:'f12'};twelveFunction.params.expression=Array.from({length:12},(_,i)=>'p'+(i+1)).join('+');const twelveTap={...makeNode('tap'),id:'tap12',source:{id:'f12',port:'out'}};const twelve={name:'twelve',nodes:[...twelveSources,twelveFunction,twelveTap],edges:twelveSources.map((n,i)=>({from:n.id,to:'f12',port:'p'+(i+1)})),iterations:1,samples:1000,seed:42};
const amplitude=makeNode('custom');
amplitude.params.expression='r*u*exp(-r/2)/sqrt(32*pi)';
const field=makeNode('tap');
field.source={id:amplitude.id,port:'out'};
field.meridian={extent:8};
const meridian={name:'Hydrogen 2p',nodes:[amplitude,field],edges:[],iterations:1,samples:1000,seed:42};
for(const [name,model] of [['furnace',sharedFurnace()],['meridian',meridian],['hydrogen',legacyHydrogen],['hydrogen_operators',hydrogenState(3,2,1)],['square',fixture('square')],['difference',fixture('difference')],['logistic',defaultModel()],['twelve',twelve]])for(const [language,extension]of [['python','py'],['julia','jl']])await writeFile(`${out}/${name}.${extension}`,generateScript(model,language));
