# Hydrogen as an operator graph

Choose **New model → Starting point → Hydrogen atom · 1s ground state**. Select any physics block to inspect its inputs, equation and derivation. The model uses atomic units and a spinless electron bound to a point nucleus.

| Stage | What the blocks compute |
|---|---|
| Hamiltonian | **Kinetic energy** supplies $-\nabla^2/(2\mu)$. **Coulomb potential** supplies $-Z/r$. **Hamiltonian** adds them. Hydrogen with a fixed proton uses $\mu=Z=1$. |
| Separated eigenproblems | **Angular momentum** selects the joint eigenvalues of $L^2$ and $L_z$. The radial solver imposes regularity at the origin and decay at infinity. Polynomial termination fixes the energy. The angular solver constructs the regular polar polynomial by Rodrigues differentiation and retains the azimuthal phase. |
| State preparation | **Stationary state** multiplies the radial and angular basis functions. **Normalize state** divides by the norm with the spherical volume measure. |
| Measurement | **Eigenenergy** reads the radial eigenvalue. **Born density** forms $\psi^*\psi$. **Sphere probability** integrates the resulting density up to the chosen radius. |

For 1s the graph gives $E=-1/2$ Hartree, $\psi=e^{-r}/\sqrt{\pi}$ and $P(r\leq1)=1-5e^{-2}$. Change **Nuclear charge** to 2 to model a hydrogenic ion. The binding energy increases fourfold and the characteristic radius halves.

Open **Orbital cloud ↗** on **Position density**. The central slice evaluates the final density on the x–z plane. Projected detections draw from the final density using a finite radial and angular grid. Both views mark the nucleus and display a Bohr-radius scale. **Save PNG** exports the current view.

The orbital library contains 20 Git designs, each with a dashboard screenshot and its exported plot. [Browse the library](https://github.com/wa200508/hydrogen_wavefunction)
