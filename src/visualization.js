import nerdamer from 'nerdamer/all.js';
import { createLawFactory } from './laws.js';

// All numerical probability evaluation is confined to this visualization module.
// Rendering never invokes a random source. Optional draws use the completed CDF.
const exactLaw = createLawFactory().law;
const number = value => Number(nerdamer(String(value)).evaluate().text('decimals'));
const clamp01 = p => Math.max(0, Math.min(1, p));
const atomMass=(descriptor,x)=>(descriptor.atoms||[]).filter(a=>Math.abs(a.value-x)<=1e-12*Math.max(1,Math.abs(x))).reduce((sum,a)=>sum+a.mass,0);
const erf = x => {
  const sign = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
};
function logGamma(z) {
  const p = [676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-0.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1; let x = 0.9999999999998099;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return 0.9189385332046727 + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function gammaQ(a, x) {
  const scale = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x === 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 2000; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-14) break; }
    return clamp01(1 - sum * scale);
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 2000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const delta = d * c; h *= delta; if (Math.abs(delta - 1) < 1e-14) break; }
  return clamp01(scale * h);
}
function betaFraction(a, b, x) {
  let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
  for (let m = 1; m < 1000; m++) {
    let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const delta = d * c; h *= delta; if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}
function betaCDF(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return clamp01(x < (a + 1) / (a + b + 2) ? front * betaFraction(a, b, x) / a : 1 - front * betaFraction(b, a, 1 - x) / b);
}
const point = value => ({ cdf: y => y < value ? 0 : 1, support: [value, value], atoms: [{ value, mass: 1 }], discrete: true, moments: { mean: value, variance: 0 }, method: 'Exact point mass' });
function discreteDescriptor(atoms, method = 'Exact finite PMF', tailMass = 0) {
  const merged = new Map(); for (const atom of atoms) merged.set(atom.value, (merged.get(atom.value) || 0) + atom.mass);
  atoms = [...merged].filter(([, mass]) => mass > 0).map(([value, mass]) => ({ value, mass })).sort((a, b) => a.value - b.value);
  const total = atoms.reduce((s, a) => s + a.mass, 0);
  if (!(total > 0)) throw Error('The probability law has no finite mass.');
  const mean = atoms.reduce((s, a) => s + a.value * a.mass, 0) / total;
  const variance = atoms.reduce((s, a) => s + (a.value - mean) ** 2 * a.mass, 0) / total;
  return { atoms, discrete: true, support: [atoms[0].value, atoms.at(-1).value], cdf: y => atoms.reduce((s, a) => s + (a.value <= y ? a.mass : 0), 0) / total, moments: { mean, variance }, method, tailMass };
}
function sourceDescriptor(term) {
  const p = Object.fromEntries(Object.entries(term.parameters).map(([k, v]) => [k, number(v)]));
  if (Object.values(p).some(v => !Number.isFinite(v))) throw Error('Distribution parameters must be finite real constants.');
  switch (term.family) {
    case 'uniform': if (!(p.max > p.min)) throw Error('Uniform requires maximum > minimum.'); return { cdf: y => clamp01((y - p.min) / (p.max - p.min)), support: [p.min, p.max], atoms: [], moments: { mean: (p.min + p.max) / 2, variance: (p.max - p.min) ** 2 / 12 }, method: 'Analytic uniform CDF' };
    case 'normal': if (!(p.sigma > 0)) throw Error('Normal requires σ > 0.'); return { cdf: y => clamp01((1 + erf((y - p.mean) / (p.sigma * Math.SQRT2))) / 2), support: [-Infinity, Infinity], atoms: [], moments: { mean: p.mean, variance: p.sigma ** 2 }, method: 'Analytic normal CDF · numerical erf' };
    case 'exponential': if (!(p.lambda > 0)) throw Error('Exponential requires λ > 0.'); return { cdf: y => y <= 0 ? 0 : -Math.expm1(-p.lambda * y), support: [0, Infinity], atoms: [], moments: { mean: 1 / p.lambda, variance: 1 / p.lambda ** 2 }, method: 'Analytic exponential CDF' };
    case 'bernoulli': if (p.p < 0 || p.p > 1) throw Error('Bernoulli requires 0 ≤ p ≤ 1.'); return discreteDescriptor([{ value: 0, mass: 1 - p.p }, { value: 1, mass: p.p }]);
    case 'poisson': {
      if (!(p.lambda > 0) || p.lambda > 10000) throw Error('Poisson rendering supports 0 < λ ≤ 10,000.');
      const cdf = y => y < 0 ? 0 : gammaQ(Math.floor(y) + 1, p.lambda); let end = Math.ceil(p.lambda + 12 * Math.sqrt(p.lambda) + 30);
      const atoms = Array.from({ length: end + 1 }, (_, k) => ({ value: k, mass: Math.exp(k * Math.log(p.lambda) - p.lambda - logGamma(k + 1)) })).filter(a => a.mass > 1e-300);
      return { ...discreteDescriptor(atoms, 'Countable PMF · rendering tail truncated', Math.max(0, 1 - cdf(end))), moments: { mean: p.lambda, variance: p.lambda } };
    }
    case 'gamma': {
      const {shape, lambda: rate} = p;
      if (!(shape > 0 && rate > 0)) throw Error('Gamma requires positive shape and rate.');
      return {
        cdf: y => y <= 0 ? 0 : 1 - gammaQ(shape, rate * y),
        support: [0, Infinity], atoms: [],
        moments: {mean: shape / rate, variance: shape / rate ** 2},
        method: 'Gamma CDF · numerical incomplete gamma'
      };
    }
    case 'beta': if (!(p.a > 0 && p.b > 0)) throw Error('Beta requires positive shape parameters.'); return { cdf: y => betaCDF(y, p.a, p.b), support: [0, 1], atoms: [], moments: { mean: p.a / (p.a + p.b), variance: p.a * p.b / ((p.a + p.b) ** 2 * (p.a + p.b + 1)) }, method: 'Analytic beta CDF · numerical incomplete beta' };
    default: throw Error(`No renderer for ${term.family}.`);
  }
}
function quantile(descriptor, probability) {
  let [lo, hi] = descriptor.support;
  if (!Number.isFinite(lo)) { lo = -1; while (descriptor.cdf(lo) > probability && lo > -1e100) lo *= 2; }
  if (!Number.isFinite(hi)) { hi = 1; while (descriptor.cdf(hi) < probability && hi < 1e100) hi *= 2; }
  for (let i = 0; i < 65; i++) { const mid = lo / 2 + hi / 2; if (descriptor.cdf(mid) >= probability) hi = mid; else lo = mid; }
  return hi;
}
function factorial(n) { if (!Number.isInteger(n) || n < 0 || n > 170) throw Error('Combinatorics requires nonnegative integer-valued inputs (factorial ≤ 170).'); let a = 1; for (let i = 2; i <= n; i++) a *= i; return a; }
function evaluateTerm(term, assignment, cache = new Map(), functions = new Map()) {
  if (cache.has(term.id)) return cache.get(term.id);
  let value;
  if (term.kind === 'constant') value = number(term.value);
  else if (term.kind === 'source') value = assignment[term.sourceId];
  else {
    const i = Object.fromEntries(Object.entries(term.inputs).map(([key, input]) => [key, evaluateTerm(input, assignment, cache, functions)])), { x, b, r } = i;
    switch (term.operation) {
      case 'custom': { if (!functions.has(term.id)) functions.set(term.id, nerdamer(term.expression).buildFunction(Object.keys(term.inputs))); value = functions.get(term.id)(...Object.keys(term.inputs).map(key=>i[key])); break; }
      case 'logistic': value = r * x * (1 - x); break;
      case 'tent': value = x < 0.5 ? r * x : r * (1 - x); break;
      case 'add': value = x + b; break; case 'subtract': value = x - b; break; case 'multiply': value = x * b; break; case 'divide': value = x / b; break; case 'power': value = x ** b; break; case 'modulo': value = ((x % b) + b) % b; break;
      case 'sin': case 'cos': case 'tanh': case 'exp': case 'log': case 'sqrt': case 'abs': value = Math[term.operation](x); break;
      case 'min': value = Math.min(x, b); break; case 'max': value = Math.max(x, b); break; case 'clamp': value = Math.min(i.max, Math.max(i.min, x)); break;
      case 'factorial': value = factorial(x); break; case 'combination': value = factorial(x) / (factorial(b) * factorial(x - b)); break; case 'permutation': value = factorial(x) / factorial(x - b); break;
      case 'greater': value = +(x > b); break; case 'less': value = +(x < b); break; case 'equal': value = +(x === b); break; case 'and': value = +(Boolean(x) && Boolean(b)); break; case 'or': value = +(Boolean(x) || Boolean(b)); break; case 'not': value = +!x; break;
      case 'switch': value = x > i.p ? i.a : b; break;
      default: throw Error(`No numerical interpretation for ${term.operation}.`);
    }
  }
  if (!Number.isFinite(value)) throw Error(`The law leaves the finite real domain at ${term.operation || term.family || term.kind}.`);
  cache.set(term.id, value); return value;
}
function affine(parent, a, b) {
  if (a === 0) return point(b);
  const values = parent.support.map(x => a * x + b).sort((x, y) => x - y);
  return { cdf: y => a > 0 ? parent.cdf((y - b) / a) : 1 - parent.cdf((y - b) / a) + atomMass(parent,(y-b)/a), support: values, atoms: (parent.atoms || []).map(p => ({ value: a * p.value + b, mass: p.mass })), method: parent.method, ...(parent.moments ? { moments: { mean: a * parent.moments.mean + b, variance: a * a * parent.moments.variance } } : {}) };
}

export function createDistributionRenderer(options = {}) {
  const cache = new Map(), materialized = new Map();
  let cdfCalls = 0;
  function guard(descriptor) {
    const raw = descriptor.cdf;
    descriptor.cdf = y => {
      if (++cdfCalls > (options.maxCdfCalls || 25000000)) throw Error('CDF evaluation budget reached. The exact symbolic law is retained; reduce feedback iterations or visualization resolution.');
      if (y < descriptor.support[0]) return 0; if (y >= descriptor.support[1]) return 1;
      return clamp01(raw(y));
    };
    return descriptor;
  }
  function build(term) {
    if (cache.has(term.id)) return cache.get(term.id);
    const result = guard(buildUncached(term));const parents=[...new Set(Object.values(term.inputs||{}).map(t=>t.id))].map(id=>cache.get(id)).filter(Boolean);result.quadrature=!!result.quadrature||parents.some(p=>p.quadrature);result.tailMass=(result.tailMass||0)+parents.reduce((sum,p)=>sum+(p.tailMass||0),0);cache.set(term.id, result); return result;
  }
  function discreteJoint(term, sources) {
    const variables = [...sources.values()].map(source => ({ id: source.sourceId, descriptor: build(source) }));
    const atoms = [], functions = new Map(), assignment = {}; let combinations = 0;
    const visit = (index, mass) => {
      if (index === variables.length) { if (++combinations > 65536) throw Error('Finite-PMF rendering budget exceeded; symbolic joint law retained.'); atoms.push({ value: evaluateTerm(term, assignment, new Map(), functions), mass }); return; }
      const variable = variables[index];
      for (const atom of variable.descriptor.atoms) if (atom.mass > 0) { assignment[variable.id] = atom.value; visit(index + 1, mass * atom.mass); }
    };
    visit(0, 1);
    return discreteDescriptor(atoms, variables.some(v => v.descriptor.tailMass) ? 'Joint PMF · rendering tail truncated' : 'Exact finite joint PMF', variables.reduce((s, v) => s + (v.descriptor.tailMass || 0), 0));
  }
  function quadrature(term, sources) {
    const dimensions = sources.size;
    if (dimensions > 3) throw Error('This law remains an exact symbolic joint integral. Deterministic visualization currently supports at most three continuous source dimensions.');
    const order = dimensions === 1 ? 4096 : dimensions === 2 ? 96 : 20, variables = [...sources.values()].map(source => {
      const d = build(source);
      return { id: source.sourceId, points: d.discrete ? d.atoms : Array.from({ length: order }, (_, i) => ({ value: quantile(d, (i + 0.5) / order), mass: 1 / order })) };
    });
    const atoms = [], assignment = {}, functions = new Map(); let cells = 0;
    function integrate(index, mass) {
      if (index === variables.length) { if (++cells > 65536) throw Error('Deterministic quadrature budget exceeded; symbolic joint integral retained.'); atoms.push({ value: evaluateTerm(term, assignment, new Map(), functions), mass }); return; }
      for (const p of variables[index].points) { assignment[variables[index].id] = p.value; integrate(index + 1, mass * p.mass); }
    }
    integrate(0, 1);
    const result = discreteDescriptor(atoms, `Numerical joint-CDF quadrature · ${cells.toLocaleString()} deterministic cells`);
    result.quadrature = true; result.discrete = false; result.atoms = []; return result;
  }
  function buildUncached(term) {
    if (term.kind === 'constant') return point(number(term.value));
    const law = exactLaw(term);
    if (law.cdf.kind === 'normal') {
      const mean = number(law.cdf.mean), variance = number(law.cdf.variance);
      if (variance === 0) return point(mean);
      return { cdf: y => (1 + erf((y - mean) / Math.sqrt(2 * variance))) / 2, support: [-Infinity, Infinity], atoms: [], moments: { mean, variance }, method: 'Symbolically derived Gaussian CDF · numerical erf' };
    }
    if (term.kind === 'source') return sourceDescriptor(term);
    if (!term.sourceIds.length) return point(evaluateTerm(term, {}));
    if (law.cdf.kind === 'uniform-sum') {
      const components = law.cdf.components.map(c => { const a = number(c.coefficient), lo = number(c.min), hi = number(c.max); return { min: Math.min(a * lo, a * hi), width: Math.abs(a) * (hi - lo) }; });
      if (components.some(c => !(c.width > 0))) throw Error('Uniform requires maximum > minimum.');
      const lo = number(law.cdf.offset) + components.reduce((s, c) => s + c.min, 0), hi = lo + components.reduce((s, c) => s + c.width, 0), dimension = components.length;
      if (dimension > 12) return quadrature(term, law.sources);
      const denominator = factorial(dimension) * components.reduce((s, c) => s * c.width, 1);
      const subsets = Array.from({ length: 2 ** dimension }, (_, mask) => { let shift = 0, sign = 1; for (let i = 0; i < dimension; i++) if (mask & (1 << i)) { shift += components[i].width; sign = -sign; } return { shift, sign }; });
      return { cdf: y => subsets.reduce((s, item) => s + item.sign * Math.max(0, y - lo - item.shift) ** dimension, 0) / denominator, support: [lo, hi], atoms: [], moments: { mean: (lo + hi) / 2, variance: components.reduce((s, c) => s + c.width ** 2 / 12, 0) }, method: 'Symbolically derived uniform-sum CDF' };
    }
    if ([...law.sources.values()].every(source => ['bernoulli', 'poisson'].includes(source.family))) return discreteJoint(term, law.sources);
    const { x, b, r } = term.inputs, scalarInput = input => input?.kind === 'constant' ? number(input.value) : null;
    const bv = scalarInput(b), rv = scalarInput(r);
    const unary = x && Object.entries(term.inputs).every(([key, input]) => key === 'x' || input.kind === 'constant');
    if (unary) {
      const p = build(x), [lo, hi] = p.support;
      if (p.discrete) return discreteDescriptor(p.atoms.map(atom => ({ value: evaluateTerm({...term, inputs:{...term.inputs,x:{id:'mapped-input',kind:'constant',value:String(atom.value)}}}, {}), mass: atom.mass })), 'Mapped finite PMF');
      if (term.operation === 'add') return affine(p, 1, bv);
      if (term.operation === 'subtract') return affine(p, 1, -bv);
      if (term.operation === 'multiply') return affine(p, bv, 0);
      if (term.operation === 'divide' && bv !== 0) return affine(p, 1 / bv, 0);
      if (['logistic', 'tent'].includes(term.operation) && rv !== 0) {
        const f = value => term.operation === 'logistic' ? rv * value * (1 - value) : rv * Math.min(value, 1 - value);
        const extremum = term.operation === 'logistic' ? rv / 4 : rv / 2;
        const ends = [f(lo), f(hi), ...(lo <= 0.5 && hi >= 0.5 ? [extremum] : [])];
        const cdf = y => {
          if (rv > 0 && y >= extremum) return 1; if (rv < 0 && y < extremum) return 0;
          let a, b;
          if (term.operation === 'logistic') { const root = Math.sqrt(Math.max(0, 1 - 4 * y / rv)); a = (1 - root) / 2; b = (1 + root) / 2; }
          else { a = y / rv; b = 1 - y / rv; }
          return rv > 0 ? p.cdf(a) + 1 - p.cdf(b) + atomMass(p,b) : p.cdf(b) - p.cdf(a) + atomMass(p,a);
        };
        return { cdf, support: [Math.min(...ends), Math.max(...ends)], atoms: (p.atoms||[]).map(a=>({value:f(a.value),mass:a.mass})), method: 'Analytic inverse-branch CDF · numerical evaluation' };
      }
      if (['logistic', 'tent'].includes(term.operation) && rv === 0) return point(0);
      if (term.operation === 'power') {
        if (bv === 0) return point(1);
        if (bv > 0 && Number.isInteger(bv) && bv % 2 === 0) return { cdf: y => y < 0 ? 0 : p.cdf(y ** (1 / bv)) - p.cdf(-(y ** (1 / bv))) + atomMass(p,-(y**(1/bv))), support: [lo <= 0 && hi >= 0 ? 0 : Math.min(lo ** bv, hi ** bv), Math.max(lo ** bv, hi ** bv)], atoms: (p.atoms||[]).map(a=>({value:a.value**bv,mass:a.mass})), method: 'Analytic multi-branch power CDF' };
        if (bv > 0 && (lo >= 0 || Number.isInteger(bv) && bv % 2 === 1)) return { cdf: y => p.cdf(Math.sign(y) * Math.abs(y) ** (1 / bv)), support: [lo ** bv, hi ** bv], atoms: (p.atoms||[]).map(a=>({value:a.value**bv,mass:a.mass})), method: 'Analytic power CDF' };
      }
      if (term.operation === 'abs') return { cdf: y => y < 0 ? 0 : p.cdf(y) - p.cdf(-y) + atomMass(p,-y), support: [lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi)), Math.max(Math.abs(lo), Math.abs(hi))], atoms: (p.atoms||[]).map(a=>({value:Math.abs(a.value),mass:a.mass})), method: 'Analytic two-branch absolute-value CDF' };
      const monotone = { exp: [Math.exp, Math.log], log: [Math.log, Math.exp], sqrt: [Math.sqrt, value => value ** 2], tanh: [Math.tanh, Math.atanh] }[term.operation];
      if (monotone) {
        if (['log', 'sqrt'].includes(term.operation) && lo < 0 || term.operation === 'log' && (hi <= 0 || (p.atoms||[]).some(a=>a.value<=0&&a.mass>0))) throw Error(`${term.operation} requires its input law to stay in its real domain.`);
        const [forward, inverse] = monotone;
        return { cdf: y => p.cdf(inverse(y)), support: [forward(lo), forward(hi)], atoms: (p.atoms||[]).map(a=>({value:forward(a.value),mass:a.mass})), method: 'Analytic change-of-variables CDF' };
      }
      if (['min', 'max', 'clamp'].includes(term.operation)) {
        const lower = term.operation === 'min' ? -Infinity : term.operation === 'max' ? bv : scalarInput(term.inputs.min);
        const upper = term.operation === 'max' ? Infinity : term.operation === 'min' ? bv : scalarInput(term.inputs.max);
        if (lower > upper) throw Error('Clamp requires lower ≤ upper.');if(lower===upper)return point(lower);
        return { cdf: y => y < lower ? 0 : y >= upper ? 1 : p.cdf(y), support: [Math.min(upper, Math.max(lower, lo)), Math.min(upper, Math.max(lower, hi))], atoms: [{ value: lower, mass: p.cdf(lower) }, { value: upper, mass: 1 - p.cdf(upper)+atomMass(p,upper) },...(p.atoms||[]).filter(a=>a.value>lower&&a.value<upper)].filter(a => Number.isFinite(a.value) && a.mass > 0), method: 'Analytic mixed law · boundary point masses retained' };
      }
      if (['greater', 'less', 'equal', 'not', 'and', 'or', 'switch'].includes(term.operation)) {
        const atZero = (p.atoms || []).filter(a => a.value === 0).reduce((s, a) => s + a.mass, 0);
        let probability;
        if (term.operation === 'greater') probability = 1 - p.cdf(bv);
        if (term.operation === 'less') probability = p.cdf(bv) - (p.atoms || []).filter(a => a.value === bv).reduce((s, a) => s + a.mass, 0);
        if (term.operation === 'equal') probability = (p.atoms || []).filter(a => a.value === bv).reduce((s, a) => s + a.mass, 0);
        if (term.operation === 'not') probability = atZero;
        if (term.operation === 'and') probability = bv ? 1 - atZero : 0;
        if (term.operation === 'or') probability = bv ? 1 : 1 - atZero;
        if (term.operation === 'switch') { probability = 1 - p.cdf(scalarInput(term.inputs.p)); return discreteDescriptor([{ value: scalarInput(term.inputs.a), mass: probability }, { value: bv, mass: 1 - probability }]); }
        return discreteDescriptor([{ value: 1, mass: probability }, { value: 0, mass: 1 - probability }]);
      }
    }
    return quadrature(term, law.sources);
  }
  function render(law, { bins = 34, resolution = 512 } = {}) {
    const key = `${law.term.id}:${bins}:${resolution}`;
    if (materialized.has(key)) return materialized.get(key);
    cdfCalls = 0;
    try {
      const descriptor = build(law.term), support = descriptor.support;
      const tailTolerance = 1e-8;
      let lo = Number.isFinite(support[0]) ? support[0] : quantile(descriptor, tailTolerance);
      let hi = Number.isFinite(support[1]) ? support[1] : quantile(descriptor, 1 - tailTolerance);
      if (!Number.isFinite(lo + hi)) throw Error('A finite visualization window could not be established.');
      const actualBounds = [lo, hi]; if (lo === hi) { lo -= 0.5; hi += 0.5; }
      const counts = Array.from({ length: bins }, (_, i) => Math.max(0, descriptor.cdf(lo + (i + 1) / bins * (hi - lo)) - (i === 0 ? 0 : descriptor.cdf(lo + i / bins * (hi - lo)))));
      const total = counts.reduce((s, x) => s + x, 0);
      let mean = 0, variance = 0;
      counts.forEach((mass, i) => mean += (lo + (i + 0.5) / bins * (hi - lo)) * mass / total);
      counts.forEach((mass, i) => variance += (lo + (i + 0.5) / bins * (hi - lo) - mean) ** 2 * mass / total);
      if (descriptor.moments) ({ mean, variance } = descriptor.moments);
      const knots = Array.from({ length: resolution + 1 }, (_, i) => ({ x: lo + i / resolution * (hi - lo), p: 0 }));
      for (const atom of descriptor.atoms || []) if (atom.value >= lo && atom.value <= hi && atom.mass > 0) knots.push({ x: atom.value, p: 0, before: true }, { x: atom.value, p: 0 });
      knots.sort((a, b) => a.x - b.x || (a.before ? -1 : 1));
      let previous = 0;
      for (const knot of knots) { const atomMass = (descriptor.atoms || []).filter(a => a.value === knot.x).reduce((s, a) => s + a.mass, 0); knot.p = Math.max(previous, descriptor.cdf(knot.x) - (knot.before ? atomMass : 0)); previous = knot.p; }
      const tailMass = (descriptor.tailMass || 0) + (Number.isFinite(support[0]) ? 0 : tailTolerance) + (Number.isFinite(support[1]) ? 0 : tailTolerance);
      const result = { status: 'ready', method: descriptor.method, approximation: { numericalEvaluation: true, momentQuadrature: !descriptor.moments || !!descriptor.quadrature,uncertifiedQuadratureError:!!descriptor.quadrature, cdfInterpolationIntervals: resolution, deterministicQuadrature: !!descriptor.quadrature, tailMass }, histogram: { counts: counts.map(mass => mass / total), min: lo, max: hi }, stats: { mean, sd: Math.sqrt(Math.max(0, variance)), min: actualBounds[0], max: actualBounds[1], n: 0 }, table: knots, symbolic: law.formula, support };
      materialized.set(key, result); return result;
    } catch (error) {
      const result = { status: 'symbolic-only', error: error.message, symbolic: law.formula };
      materialized.set(key, result); return result;
    }
  }
  return { render, cdf(law, y) { cdfCalls = 0; return build(law.term).cdf(y); } };
}

export function sampleFinalDistribution(rendered, count = 150, seed = 42) {
  if (rendered.status !== 'ready') return [];
  // The only probability RNG in the application. The final CDF is already built.
  let a = seed | 0;
  const random = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const table = rendered.table;
  return Array.from({ length: Math.min(50000, Math.max(0, count)) }, () => {
    const u = random(); let low = 0, high = table.length - 1;
    while (low < high) { const mid = (low + high) >> 1; if (table[mid].p >= u) high = mid; else low = mid + 1; }
    const right = table[low], left = table[Math.max(0, low - 1)];
    if (right.x === left.x || right.p === left.p) return right.x;
    return left.x + clamp01((u - left.p) / (right.p - left.p)) * (right.x - left.x);
  });
}
