import {ENGINE_VERSION,makeNode} from './engine.js';

export function hydrogenState(n=1,ell=0,m=0) {
  const label=n+('spdfghiklmnoqrtu'[ell]||'(ℓ='+ell+')');
  function block(id,op,x,y,params={}) {
    const node=makeNode(op,x,y);
    return {...node,id,params:{...node.params,...params}};
  }
  function tap(id,name,source,x,y) {
    return {...block(id,'tap',x,y),params:{},name,source:{id:source,port:'out'}};
  }
  const nodes=[
    block('kinetic','kinetic',0,10),block('potential','coulomb',0,160),
    block('H','hamiltonian',210,10),block('basis','angularBasis',0,340,{ell,m}),
    block('radial','radialEigen',420,10,{n}),block('angular','angularEigen',210,340),
    block('psi','eigenstate',420,340),block('normalized','normalizeState',630,340),block('density','born',630,180),
    block('energy','eigenenergy',420,175),block('sphere','sphereMass',630,10,{radius:n*n}),
    {...tap('field','Position density','density',840,250),orbitalCloud:true},
    tap('insideTap','Enclosed probability','sphere',840,10)
  ];
  const links=[['kinetic','H','kinetic'],['potential','H','potential'],['H','radial','H'],['basis','radial','basis'],
    ['basis','angular','basis'],['radial','psi','R'],['angular','psi','Y'],['psi','normalized','state'],['normalized','density','state'],
    ['radial','energy','radial'],['density','sphere','density']];
  return {id:crypto.randomUUID(),name:n===1?'Hydrogen 1s ground state':`Hydrogen ${label} (n=${n}, ℓ=${ell}, m=${m})`,
    branch:n===1?'hydrogen-1s':`orbital/${label}-m${m}`,engine:ENGINE_VERSION,iterations:1,samples:10000,seed:42,
    nodes,edges:links.map(([from,to,port])=>({from,to,port}))};
}
export const hydrogenGroundState=()=>hydrogenState();
