import {ENGINE_VERSION, makeNode} from './engine.js';

// Coordinates use Bohr radii. The 1s state is isotropic, so integrating its
// volume density over a shell gives the complete radial measurement law.
export function hydrogenGroundState() {
  function block(id, op, name, x, y, params = {}) {
    const node = makeNode(op, x, y);
    return {...node, id, name, params: {...node.params, ...params}};
  }
  function tap(id, name, target, x, y) {
    return {...block(id, 'tap', name, x, y), source: {id: target, port: 'out'}};
  }
  return {
    id: crypto.randomUUID(),
    name: 'Hydrogen 1s ground state',
    branch: 'hydrogen-1s',
    engine: ENGINE_VERSION,
    iterations: 1, samples: 10000, seed: 42,
    nodes: [
      block('radius', 'gamma', 'Electron radius (a₀)', 15, 30, {shape: 3, lambda: 2}),
      block('inside', 'less', 'Inside probe sphere?', 315, 30),
      tap('insideTap', 'Inside = 1, outside = 0', 'inside', 550, 30),
      tap('radialTap', 'Radial probability (a₀)', 'radius', 15, 235),
      block('probe', 'constant', 'Probe radius (a₀)', 315, 235, {value: 1}),
      block('psi', 'custom', '1s amplitude (a₀⁻³ᐟ²)', 550, 235, {expression: 'exp(-x)/sqrt(pi)'})
    ],
    edges: [
      {from: 'radius', to: 'inside', port: 'x'},
      {from: 'probe', to: 'inside', port: 'b'},
      {from: 'probe', to: 'psi', port: 'x'}
    ]
  };
}
