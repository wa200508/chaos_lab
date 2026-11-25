// Atomic units. Each constructor consumes the typed result on its incoming wires.
// Radial polynomials and their normalization integrals use exact integer arithmetic.
const definitions = [
  ['kinetic','Kinetic energy','T','−∇²/(2μ)',{}, {mass:1}],
  ['coulomb','Coulomb potential','V','−Z/r',{}, {charge:1}],
  ['hamiltonian','Hamiltonian','Ĥ','T + V',{kinetic:'kinetic',potential:'coulomb'}],
  ['angularBasis','Angular momentum','L²','L², Lz',{},{ell:0,m:0}],
  ['radialEigen','Radial eigenproblem','R','Hℓ R = E R',{H:'hamiltonian',basis:'angularBasis'},{n:1}],
  ['angularEigen','Angular eigenproblem','Y','L²Y, LzY',{basis:'angularBasis'}],
  ['eigenstate','Stationary state','ψ','R · Y',{R:'radialEigen',Y:'angularEigen'}],
  ['normalizeState','Normalize state','N','ψ / √⟨ψ|ψ⟩',{state:'eigenstate'}],
  ['born','Born density','ρ','ψ* · ψ',{state:'normalizeState'}],
  ['sphereMass','Sphere probability','∫','∫sphere ρ d³x',{density:'born'},{radius:1}],
  ['eigenenergy','Eigenenergy','E','E (Hartree)',{radial:'radialEigen'}],
];
export const quantumOps=Object.fromEntries(definitions.map(([op,name,symbol,formula,inputs,params={}])=>
  [op,{op,name,symbol,formula,inputs,params,category:'Quantum mechanics',type:'quantum'}]));
export const parameterNames={mass:'Reduced mass μ (electron masses)',charge:'Nuclear charge Z',ell:'Orbital quantum number ℓ',m:'Magnetic quantum number m',n:'Principal quantum number n',radius:'Sphere radius (Bohr radii)'};

const factorial=n=>{let value=1n;for(let i=2;i<=n;i++)value*=BigInt(i);return value;};
function polynomial(coefficients,variable) {
  const terms=coefficients.flatMap((c,i)=>c===0n?[]:[i===0?String(c):`(${c})*(${variable})^${i}`]);
  return '('+(terms.join('+')||'0')+')';
}
function positive(value,name) {
  if(!Number.isFinite(value)||value<=0) throw Error(name+' must be positive.');
  return value;
}

function radial(H,basis,n) {
  const {ell}=basis;
  if(!Number.isSafeInteger(n)||n<=ell || n>16)throw Error('The finite bound-state solver supports ℓ < n ≤ 16.');
  const p=n-ell-1;
  // Regular at zero: R = exp(-s/2) s^ℓ P(s), s = 2κr.
  // The decaying series terminates when μZ/κ = p+ℓ+1.
  const scale=`(2*(${H.mass})*(${H.charge})/${n})`,s=`(${scale}*r)`;
  const coeff=[factorial(p)*factorial(p+2*ell+1)/factorial(2*ell+1)];
  for(let j=0;j<p;j++) coeff.push(coeff[j]*BigInt(j-p)/BigInt((j+1)*(j+2*ell+2)));
  // ∫s² R² ds is a sum of k! moments of exp(-s).
  const shell=Array(2*n+1).fill(0n);
  for(let i=0;i<coeff.length;i++)for(let j=0;j<coeff.length;j++)shell[2*ell+2+i+j]+=coeff[i]*coeff[j];
  const norm=shell.reduce((sum,c,k)=>sum+c*factorial(k),0n);
  const tail=shell.map((_,j)=>shell.slice(j).reduce((sum,c,k)=>sum+c*factorial(k+j)/factorial(j),0n));
  const basisFunction=`exp(-${s}/2)*${s}^${ell}*${polynomial(coeff,s)}`;
  const normSquared=`(${norm}/(${scale})^3)`;
  const expression=`(${basisFunction})/sqrt(${normSquared})`;
  const energy=`-(${H.mass})*(${H.charge})^2/(2*${n}^2)`;
  return {ell,n,expression,basisFunction,normSquared,energy,cdf:`1-exp(-${s})*${polynomial(tail,s)}/${norm}`,extent:(n===1?4:2*n*n)/(H.mass*H.charge),
    equation:`[−(∂²r + 2/r ∂r − ${basis.eigenvalue}/r²)/(2μ) − Z/r] R = E R`,
    derivation:`Regular at r = 0 and normalizable at infinity. For s = 2κr, P(s) has degree p = ${p}. Its coefficients obey a[j+1]/a[j] = (j−p)/[(j+1)(j+2ℓ+2)]. κ = μZ/${n}, E = ${energy} Hartree. R(r) = ${expression}`};
}

function angular({ell,m}) {
  // Rodrigues constructs the regular solutions of the angular eigenproblem.
  // Differentiate (u²−1)^ℓ exactly ℓ+|m| times. u = cos θ.
  const a=Math.abs(m),order=ell+a,coeff=Array(ell-a+1).fill(0n);
  for(let j=0;j<=ell;j++){
    if(2*j<order)continue;
    const choose=factorial(ell)/(factorial(j)*factorial(ell-j));
    coeff[2*j-order]=BigInt((-1)**(ell-j+(m>=0?a:0)))*choose*factorial(2*j)/factorial(2*j-order);
  }
  const basisFunction=`(1-u^2)^(${a}/2)*${polynomial(coeff,'u')}/${2n**BigInt(ell)*factorial(ell)}`;
  const normSquared=`(4*pi*${factorial(ell+a)}/(${2*ell+1}*${factorial(ell-a)}))`;
  const expression=`(${basisFunction})/sqrt(${normSquared})`;
  return {ell,m,expression,basisFunction,normSquared,equation:`L²Y = ${ell*(ell+1)}Y, LzY = ${m}Y`,
    derivation:`Periodic azimuth exp(i·${m}·φ). Regular polar solution by Rodrigues differentiation, normalized over solid angle. Y(θ,0) = ${expression}`};
}

export function applyQuantum(node,inputs) {
  const {op,params}=node;
  for(const [port,type] of Object.entries(quantumOps[op].inputs)){
    if(inputs[port]?.kind!==type)throw Error(`Connect ${quantumOps[type].name} to ${port}.`);
  }
  let result;
  switch(op){
    case 'kinetic': result={mass:positive(params.mass,'Reduced mass'),equation:`T = −∇²/(2·${params.mass})`,derivation:'Relative-coordinate kinetic energy in atomic units.'};break;
    case 'coulomb': result={charge:positive(params.charge,'Nuclear charge'),equation:`V(r) = −${params.charge}/r`,derivation:'Attraction of an electron to a point nucleus.'};break;
    case 'hamiltonian': result={mass:inputs.kinetic.mass,charge:inputs.potential.charge,equation:`H = −∇²/(2·${inputs.kinetic.mass}) − ${inputs.potential.charge}/r`,derivation:'Central potential permits separation into radial and angular eigenproblems.'};break;
    case 'angularBasis': {
      const {ell,m}=params;
      if(!Number.isSafeInteger(ell)||ell<0||ell>=16||!Number.isSafeInteger(m)||Math.abs(m)>ell)throw Error('Use integer 0 ≤ ℓ < 16 and −ℓ ≤ m ≤ ℓ.');
      result={ell,m,eigenvalue:ell*(ell+1),equation:`L² → ${ell*(ell+1)} ℏ², Lz → ${m} ℏ`,derivation:'Joint eigenvalues of the commuting angular momentum operators.'};break;
    }
    case 'radialEigen': result=radial(inputs.H,inputs.basis,params.n);break;
    case 'angularEigen': result=angular(inputs.basis);break;
    case 'eigenstate': {
      const R=inputs.R,Y=inputs.Y;
      if(R.ell!==Y.ell)throw Error('Radial and angular states must have the same ℓ.');
      result={n:R.n,ell:R.ell,m:Y.m,extent:R.extent,cdf:R.cdf,normSquared:`(${R.normSquared})*(${Y.normSquared})`,amplitude:`(${R.basisFunction})*(${Y.basisFunction})`,
        equation:`ψ = R(r) Y(θ,0) exp(i·${Y.m}·φ)`,derivation:'Separated radial and angular basis functions multiplied before normalization.'};break;
    }
    case 'normalizeState': {
      const state=inputs.state;
      result={...state,amplitude:`(${state.amplitude})/sqrt(${state.normSquared})`,equation:'⟨ψ|ψ⟩ = 1',
        derivation:`Divide by the square root of ∫r²|R|²dr × ∫|Y|²dΩ = ${state.normSquared}. The radial polynomial integrates term by term using exponential moments; the polar norm uses Legendre orthogonality.`};
      break;
    }
    case 'born': {
      const state=inputs.state;
      result={n:state.n,extent:state.extent,cdf:state.cdf,density:`(${state.amplitude})^2`,
        equation:'ρ = ψ*ψ',derivation:'The azimuthal phase cancels under complex conjugation. Integrate with volume element r² dr d(cos θ) dφ.'};break;
    }
    case 'sphereMass': {
      if(!Number.isFinite(params.radius)||params.radius<0)throw Error('Use a nonnegative probe radius.');
      result={scalar:inputs.density.cdf.replace(/\br\b/g,'('+params.radius+')'),equation:`P(r ≤ ${params.radius})`,derivation:inputs.density.cdf};break;
    }
    case 'eigenenergy': result={scalar:inputs.radial.energy,equation:'Bound-state energy (Hartree)',derivation:inputs.radial.energy};break;
  }
  return {...result,kind:op};
}
