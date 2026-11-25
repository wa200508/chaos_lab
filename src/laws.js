import nerdamer from 'nerdamer/all.js';

export const ENGINE_VERSION = 'symbolic-distributions/v2';
export const scalar = value => {
  const expression = nerdamer(String(value));
  if (expression.variables().length) throw new Error(`Unbound parameter: ${value}`);
  return expression.toString();
};
const algebra = expression => nerdamer(expression).expand().toString();
const zero = value => value === '0';
const refInputs = inputs => Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value.id]));

// This module constructs probability measures. It contains no numerical evaluator,
// random-number generator, floating-point quadrature, or sample arrays.
export function createLawFactory() {
  const terms = new Map(), interned = new Map();
  function intern(key, definition) {
    if (interned.has(key)) return interned.get(key);
    const term = { id: `t${terms.size}`, ...definition };
    terms.set(term.id, term); interned.set(key, term);
    return term;
  }
  function constant(value) {
    const exact = scalar(value);
    return intern(`constant:${exact}`, { kind: 'constant', value: exact, sourceIds: [], linear: { offset: exact, coefficients: {} }, cdf: { kind: 'dirac', at: exact } });
  }
  function source(id, family, params) {
    const keys = { uniform: ['min', 'max'], normal: ['mean', 'sigma'], exponential: ['lambda'], bernoulli: ['p'], poisson: ['lambda'], beta: ['a', 'b'], gamma: ['shape', 'lambda'] }[family];
    if (!keys) throw new Error(`Unknown probability distribution: ${family}`);
    const parameters = Object.fromEntries(keys.map(key => [key, scalar(params[key])]));
    return intern(`source:${id}`, { kind: 'source', sourceId: id, family, parameters, sourceIds: [id], linear: { offset: '0', coefficients: { [id]: '1' } }, cdf: { kind: 'source', family, parameters } });
  }
  function linearCombine(a, b, scaleA = '1', scaleB = '1') {
    if (!a.linear || !b.linear) return null;
    const keys = new Set([...Object.keys(a.linear.coefficients), ...Object.keys(b.linear.coefficients)]);
    const coefficients = {};
    for (const key of keys) {
      const coefficient = algebra(`(${scaleA})*(${a.linear.coefficients[key] || '0'})+(${scaleB})*(${b.linear.coefficients[key] || '0'})`);
      if (!zero(coefficient)) coefficients[key] = coefficient;
    }
    return { offset: algebra(`(${scaleA})*(${a.linear.offset})+(${scaleB})*(${b.linear.offset})`), coefficients };
  }
  function apply(operation, inputs, expression = null) {
    let { x, b, r } = inputs;
    if (operation === 'subtract' && x.id === b.id) return constant('0');
    if (operation === 'add' && b.kind === 'constant' && zero(b.value)) return x;
    if (operation === 'multiply' && b.kind === 'constant' && b.value === '1') return x;
    if (operation === 'multiply' && x.id === b?.id) return apply('power', { x, b: constant('2') });
    if (operation === 'custom') {
      const parsed = nerdamer(expression);
      const variables = parsed.variables();
      if (variables.some(v => !Object.hasOwn(inputs,v))) throw new Error(`Unknown variable in ${expression}. Declare an input port for every variable.`);
      inputs = Object.fromEntries(Object.entries(inputs).filter(([key]) => variables.includes(key)));
      if (!variables.length) return constant(parsed.toString());
      const fixed=Object.fromEntries(Object.entries(inputs).filter(([,value])=>value.kind==='constant').map(([key,value])=>[key,value.value]));
      const reduced=nerdamer(expression,fixed),active=variables.filter(name=>inputs[name].kind!=='constant');
      if(!active.length)return constant(reduced.toString());
      const gradients=active.map(name=>nerdamer.diff(reduced,name));
      if(gradients.every(g=>g.variables().every(name=>!active.includes(name)))){
        let result=constant(nerdamer(reduced.toString(),Object.fromEntries(active.map(name=>[name,'0']))).toString());
        for(let index=0;index<active.length;index++)result=apply('add',{x:result,b:apply('multiply',{x:inputs[active[index]],b:constant(gradients[index].toString())})});
        return result;
      }
      if (x && variables.includes('x') && Object.entries(inputs).every(([key, value]) => key === 'x' || value.kind === 'constant')) {
        const substitutions = Object.fromEntries(Object.entries(inputs).filter(([key]) => key !== 'x').map(([key, value]) => [key, value.value]));
        const resolved = nerdamer(expression, substitutions).toString();
        const derivative = nerdamer.diff(resolved, 'x');
        if (!derivative.variables().includes('x')) {
          const coefficient = derivative.toString(), offset = nerdamer(resolved, { x: '0' }).toString();
          return apply('add', { x: apply('multiply', { x, b: constant(coefficient) }), b: constant(offset) });
        }
        const monomial = resolved.match(/^(?:(.+)\*)?x\^(\([^()]+\)|[0-9]+)$/);
        if (monomial && !nerdamer(monomial[1] || '1').variables().length) {
          return apply('multiply', { x: apply('power', { x, b: constant(monomial[2]) }), b: constant(monomial[1] || '1') });
        }
        for (const op of ['exp', 'log', 'sqrt', 'sin', 'cos', 'tanh', 'abs']) {
          if (resolved === `${op}(x)`) return apply(op, { x });
        }
      }
      expression = parsed.toString();
    }
    let linear = null;
    if (operation === 'add') linear = linearCombine(x, b);
    if (operation === 'subtract') linear = linearCombine(x, b, '1', '-1');
    if (operation === 'multiply' && b.kind === 'constant') linear = linearCombine(x, constant('0'), b.value);
    if (operation === 'multiply' && x.kind === 'constant') linear = linearCombine(b, constant('0'), x.value);
    if (operation === 'divide' && b.kind === 'constant' && b.value !== '0') linear = linearCombine(x, constant('0'), `1/(${b.value})`);
    if (linear && !Object.keys(linear.coefficients).length) return constant(linear.offset);
    const sourceIds = linear ? Object.keys(linear.coefficients) : [...new Set(Object.values(inputs).flatMap(t => t.sourceIds))];
    const key = JSON.stringify([operation, refInputs(inputs), expression]);
    return intern(key, { kind: 'apply', operation, inputs, ...(expression ? { expression } : {}), sourceIds, ...(linear ? { linear } : {}), cdf: { kind: 'pushforward', operation, inputs: refInputs(inputs), sourceIds } });
  }
  function sourcesOf(term) {
    const result = new Map(), visited = new Set();
    function visit(t) {
      if (visited.has(t.id)) return; visited.add(t.id);
      if (t.kind === 'source') result.set(t.sourceId, t);
      for (const value of Object.values(t.inputs || {})) visit(value);
    }
    visit(term);
    return new Map([...result].filter(([key]) => term.sourceIds.includes(key)));
  }
  function law(term) {
    const sources = sourcesOf(term);
    let cdf = term.cdf;
    if (term.linear && term.sourceIds.length && [...sources.values()].every(s => s.family === 'normal')) {
      const mean = algebra([term.linear.offset, ...[...sources].map(([key, s]) => `(${term.linear.coefficients[key]})*(${s.parameters.mean})`)].join('+'));
      const variance = algebra([...sources].map(([key, s]) => `((${term.linear.coefficients[key]})*(${s.parameters.sigma}))^2`).join('+'));
      cdf = { kind: 'normal', mean, variance };
    } else if (term.linear && term.sourceIds.length && [...sources.values()].every(s => s.family === 'uniform')) {
      cdf = { kind: 'uniform-sum', offset: term.linear.offset, components: [...sources].map(([key, s]) => ({ sourceId: key, coefficient: term.linear.coefficients[key], ...s.parameters })) };
    }
    return {
      kind: 'symbolic-law', term, sources, sourceIds: term.sourceIds, cdf,
      definition: { kind: 'pushforward-measure', map: term.id, joint: { kind: 'independent-product', sourceIds: term.sourceIds } },
      formula: term.kind === 'constant' ? `Dirac(${term.value})` : `P(${formatTerm(term)} ≤ y)`,
    };
  }
  return { constant, source, apply, law, terms, sourcesOf };
}

export function formatTerm(term, depth = 4) {
  if (term.kind === 'constant') return term.value;
  if (term.kind === 'source') return `X[${term.sourceId}]`;
  if (depth <= 0) return term.id;
  const values = Object.entries(term.inputs).map(([key, value]) => `${key}=${formatTerm(value, depth - 1)}`).join(', ');
  return `${term.operation === 'custom' ? term.expression : term.operation}(${values})`;
}

export function exportSymbolicGraph(analysis) {
  return {
    engine: ENGINE_VERSION,
    ...(Object.keys(analysis.quantum||{}).length?{quantum:analysis.quantum}:{}),
    quantities:analysis.quantities,
    sourceSemantics: 'Distinct source blocks are independent; all uses of one source retain its identity, including feedback iterations.',
    terms: [...analysis.terms.values()].map(term => ({ ...term, ...(term.inputs ? { inputs: refInputs(term.inputs) } : {}) })),
    outputs: Object.fromEntries(Object.entries(analysis.laws).map(([id, law]) => [id, { root: law.term.id, cdf: law.cdf, definition: law.definition }])),
    errors: analysis.errors,
  };
}
