# Hydrogen 1s

## Dashboard changes needed

The spatial ground state of isolated, nonrelativistic hydrogen has a real, spherically symmetric stationary wavefunction. Existing custom functions and constants can evaluate its amplitude at a chosen radius. Existing taps can show scalar measurement probabilities. The block library lacks the Gamma law for the Born radial distribution. The source schema, inspector, CDF renderer, and both script exporters need the same shape/rate convention. The template picker needs an entry that assembles these pieces as an editable graph.

This first example assumes a fixed point proton, atomic units, and the pure spatial eigenstate with n = 1, ℓ = 0, m = 0. Spin, external fields, and superpositions are outside this example. Time evolution contributes only a global phase to this eigenstate.
