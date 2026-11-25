// A fixed-m hydrogen eigenstate has azimuth-independent probability density.
// Sweep the signed meridian amplitude at φ=0 over r and u=cos(θ).
import nerdamer from 'nerdamer/all.js';

export function meridianSpec(model, tap, analysis) {
  const field=analysis?.quantum?.[tap?.id];
  if(field?.kind==='born'&&tap.orbitalCloud!==false)return {expression:field.density,isDensity:true,extent:field.extent,view:field.n===1?'cloud':'slice'};
  if (!tap?.meridian || tap.source?.port !== 'out') return null;
  const node = model.nodes.find(n => n.id === tap.source.id);
  const extent = Number(tap.meridian.extent);
  if (node?.op !== 'custom' || !(extent > 0 && Number.isFinite(extent))) return null;
  return {expression:node.params.expression, extent};
}

export function meridianData(spec, count, seed) {
  const expr = nerdamer(spec.expression);
  if (expr.variables().some(name => !['r','u'].includes(name))) throw Error('Meridian amplitude uses r and u = cos(θ).');
  const evaluate = expr.buildFunction(['r','u']);
  const density = spec.isDensity ? evaluate : (r,u) => evaluate(r,u)**2;
  let points;
  return {get points(){return points??=drawPositions(density,spec.extent,count,seed);},extent:spec.extent,view:spec.view||'slice',density:(x,z)=>{
    const r=Math.hypot(x,z);
    return density(r,r?z/r:1);
  }};
}

function drawPositions(density,extent,count,seed){
  const nr=256, nu=128, limit=2*extent;
  const weights=new Float64Array(nr*nu);
  let sum=0;
  for(let i=0;i<nr;i++){
    const r=(i+0.5)*limit/nr;
    for(let j=0;j<nu;j++){
      sum += r*r*density(r,2*(j+0.5)/nu-1);
      weights[i*nu+j]=sum;
    }
  }
  if (!(sum>0 && Number.isFinite(sum))) throw Error('Amplitude must have finite positive mass in the field.');
  let state=seed>>>0;
  function random(){state=(Math.imul(1664525,state)+1013904223)>>>0;return (state+.5)/4294967296;}
  return Array.from({length:Math.min(count,50000)},()=>{
    const target=random()*sum;
    let lo=0, hi=weights.length-1;
    while(lo<hi){const mid=(lo+hi)>>>1;if(weights[mid]<target)lo=mid+1;else hi=mid;}
    const r=(Math.floor(lo/nu)+random())*limit/nr, u=2*((lo%nu)+random())/nu-1;
    const angle=random()*2*Math.PI, transverse=r*Math.sqrt(1-u*u);
    return [transverse*Math.cos(angle),r*u,transverse*Math.sin(angle)];
  });
}
