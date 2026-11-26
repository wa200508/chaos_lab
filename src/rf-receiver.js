import {ENGINE_VERSION, makeNode} from './engine.js';

// One real baseband quadrature, in units of the reference input noise RMS.
// Each stage's equivalent input noise is independent and precedes its gain.
export function rfReceiver() {
  function block(id, op, name, x, y, subsystem, params = {}) {
    const node = makeNode(op, x, y);
    return {...node, id, name, subsystem, units: 'normalized amplitude', params: {...node.params, ...params}};
  }
  function tap(id, name, from, x, y) {
    return {...makeNode('tap', x, y), id, name, source: {id: from, port: 'out'}};
  }
  const input = 'Receiver input', lna = 'Low-noise amplifier', ifAmp = 'IF amplifier';
  const nodes = [
    block('carrier', 'constant', 'Carrier amplitude', 0, 0, input, {value: 4}),
    block('thermal', 'normal', 'Source noise', 0, 126, input, {mean: 0, sigma: 1}),
    block('input', 'add', 'Signal + noise', 285, 15, input),
    tap('inputLaw', 'Receiver input', 'input', 805, 15),
    block('lnaNoise', 'normal', 'LNA noise', 0, 255, lna, {mean: 0, sigma: 0.5}),
    block('lnaSum', 'add', 'LNA input sum', 285, 210, lna),
    block('lnaGain', 'multiply', 'LNA gain', 545, 210, lna, {b: 4}),
    tap('lnaLaw', 'After LNA', 'lnaGain', 805, 210),
    block('ifNoise', 'normal', 'IF noise', 0, 425, ifAmp, {mean: 0, sigma: 2}),
    block('ifSum', 'add', 'IF input sum', 285, 400, ifAmp),
    block('ifGain', 'multiply', 'IF gain', 545, 400, ifAmp, {b: 2}),
    tap('outputLaw', 'Receiver output', 'ifGain', 805, 400)
  ];
  const edges = [
    {from: 'carrier', to: 'input', port: 'x'}, {from: 'thermal', to: 'input', port: 'b'},
    {from: 'input', to: 'lnaSum', port: 'x'}, {from: 'lnaNoise', to: 'lnaSum', port: 'b'},
    {from: 'lnaSum', to: 'lnaGain', port: 'x'},
    {from: 'lnaGain', to: 'ifSum', port: 'x'}, {from: 'ifNoise', to: 'ifSum', port: 'b'},
    {from: 'ifSum', to: 'ifGain', port: 'x'}
  ];
  return {id: crypto.randomUUID(), name: 'Friis receiver chain', branch: 'friis-receiver',
    engine: ENGINE_VERSION, iterations: 1, samples: 10000, seed: 42, nodes, edges};
}
