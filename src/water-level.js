import {ENGINE_VERSION, makeNode} from './engine.js';

// Gates are one metre apart in calibrated range (4 m and 5 m).
// In this local window the clean leading edge rises by half its peak per metre.
export function waterLevelAltimeter() {
  const scene = 'Surface and echo', receiver = 'Power readout', estimator = 'Threshold retracker';
  const nodes = [], edges = [];
  function block(id, op, name, col, row, subsystem, units, params = {}) {
    const node = makeNode(op, col * 218, row * 155);
    nodes.push({...node, id, name, subsystem, units, params: {...node.params, ...params}});
  }
  function wire(from, to, port = 'x') { edges.push({from, to, port}); }
  function tap(id, name, from, col, row) {
    nodes.push({...makeNode('tap', col * 218, row * 155), id, name, source: {id: from, port: 'out'}});
  }
  const power = 'normalized power';
  block('truth', 'constant', 'Surface range', 0, 0, scene, 'm', {value: 4.5});
  block('lateMargin', 'constant', 'Far gate', 0, 1, scene, 'm', {value: 5});
  block('margin', 'subtract', 'Far gate − surface', 1, 0, scene, 'm');
  wire('lateMargin', 'margin'); wire('truth', 'margin', 'b');
  block('shape', 'multiply', 'Near gate fraction', 2, 0, scene, '', {b: 0.5});
  wire('margin', 'shape');
  block('peak', 'gamma', 'Surface echo power', 1, 1, scene, power, {shape: 4, lambda: 4});
  block('clean', 'multiply', 'Near echo power', 3, 0, scene, power);
  wire('shape', 'clean'); wire('peak', 'clean', 'b');
  block('rise', 'multiply', 'Echo rise per gate', 2, 1, scene, power, {b: 0.5});
  wire('peak', 'rise');
  block('scatter', 'exponential', 'Background scatter', 0, 2, receiver, '', {lambda: 1});
  block('weibull', 'sqrt', 'Weibull shape 2', 1, 2, receiver, '');
  wire('scatter', 'weibull');
  block('floor', 'multiply', 'Residual background', 2, 2, receiver, power, {b: 0.08});
  wire('weibull', 'floor');
  block('near', 'add', 'Near gate readout', 3, 2, receiver, power);
  wire('clean', 'near'); wire('floor', 'near', 'b');
  block('far', 'add', 'Far gate readout', 4, 1, receiver, power);
  wire('near', 'far'); wire('rise', 'far', 'b');
  block('threshold', 'multiply', 'Reference threshold', 1, 3, estimator, power, {b: 0.5});
  wire('peak', 'threshold');
  block('headroom', 'subtract', 'Threshold − near', 2, 3, estimator, power);
  wire('threshold', 'headroom'); wire('near', 'headroom', 'b');
  block('span', 'subtract', 'Far − near', 3, 3, estimator, power);
  wire('far', 'span'); wire('near', 'span', 'b');
  block('crossing', 'divide', 'Crossing fraction', 1, 4, estimator, '');
  wire('headroom', 'crossing'); wire('span', 'crossing', 'b');
  block('bounded', 'clamp', 'Limit to gate pair', 2, 4, estimator, '', {min: 0, max: 1});
  wire('crossing', 'bounded');
  block('nearGate', 'subtract', 'Near gate', 0, 4, scene, 'm', {b: 1});
  wire('lateMargin', 'nearGate');
  block('range', 'add', 'Reported range', 3, 4, estimator, 'm');
  wire('nearGate', 'range', 'b');
  wire('bounded', 'range');
  block('mount', 'constant', 'Sensor elevation', 0, 5, estimator, 'm', {value: 6});
  block('height', 'subtract', 'Reported level', 1, 5, estimator, 'm');
  wire('mount', 'height'); wire('range', 'height', 'b');
  tap('rangeTap', 'Range estimate', 'range', 4, 4);
  tap('heightTap', 'Water level', 'height', 2, 5.25);
  tap('gateTap', 'Received power', 'near', 4, 2.15);
  return {id: crypto.randomUUID(), name: 'Water-level radar altimeter', branch: 'water-level-altimeter',
    view: {overview: true, selected: 'rangeTap'}, engine: ENGINE_VERSION, iterations: 1, samples: 10000, seed: 42, nodes, edges};
}
