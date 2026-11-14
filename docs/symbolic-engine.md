# Symbolic distribution contract

## Execution boundary

Compilation builds exact symbolic scalar expressions and probability laws. It does not sample distributions, generate arrays of random inputs, estimate histograms, or perform numerical probability quadrature. The source identity is part of the model. Two wires from the same source denote the same random variable; two source blocks denote independent variables.

For an expression `Y = g(X1, ..., Xd)` with independent source measures `μ1, ..., μd`, the final CDF is the exact pushforward:

```text
FY(y) = ∫ 1[g(x1, ..., xd) ≤ y] μ1(dx1) ... μd(dxd)
```

Atomic sources use sums. Mixed laws retain their point masses. The equation DAG specifies `g` without expanding feedback into an enormous polynomial. Canonical Gaussian and uniform affine laws are derived symbolically. Other transforms remain exact, explicitly defined pushforward operators even when no closed form is available.

Examples checked by tests:

- `X ~ Uniform(0,1), Y = X²`: `FY(y) = sqrt(y)` on `[0,1]`.
- `X ~ Uniform(-1,1), Y = X²`: both inverse branches contribute.
- `X ~ Uniform(0,1), Y = 4X(1-X)`: `FY(y) = 1 - sqrt(1-y)` on `[0,1]`.
- `X-X`: a point mass at zero.
- `X+X` for a standard Gaussian: variance four. Two independent standard Gaussian sources sum to variance two.
- Twelve named inputs remain twelve declared arguments. Repeated connections preserve correlation.

## State and operators

A Unit delay supplies its initial law on the first iteration and the prior incoming law thereafter. Its `initial` port can be connected to a law derived independently of the state loop. Feedback is finitely unrolled according to the model's iteration count. It does not introduce fresh random variables implicitly.

The accumulator sums through iteration time, retaining joint source dependence. It never accumulates across display samples. Differentiation and integration act on the symbolic function expression; an indefinite integration block uses integration constant zero. Combinatorics requires integer-valued inputs in its mathematical domain; transformations leaving the real domain cannot be plotted as valid real-valued laws.

Custom inputs are named arguments, not anonymous sockets. Auto mode infers the free variables in the expression. Manual mode declares the list and per-input constant defaults. Unused manual inputs do not affect the law. Undeclared variables are errors. The expression, port schema, defaults, wire names, and routing metadata are saved in the graph. The symbolic artifact records the resulting expression DAG and exact source identities.

## Numerical visualization

Only a visualization request may numerically evaluate a law. The browser renderer uses:

- Analytic source CDFs (with numerical special-function evaluation as necessary).
- Symbolically derived Gaussian affine laws and up to twelve independent uniform affine components.
- Analytic inverse branches for supported monotone transforms, even powers, logistic maps, and tent maps.
- Finite joint PMFs and explicit boundary atoms for mixed laws.
- Deterministic probability quadrature for general joint laws with at most three independent source dimensions. One-dimensional quadrature uses 4,096 cells; two dimensions use 96 per axis; three use 20 per axis. It is not a certified error bound and is labeled as numerical quadrature.

Visualization has explicit work budgets. If a law cannot be evaluated within them, the symbolic law remains available and the plot explains the limit. No upstream Monte Carlo fallback is allowed.

Histogram bars are CDF differences, not counts of propagated samples. The optional sample trace uses an interpolated final-CDF table (512 intervals by default), preserving known atoms. It is a visualization approximation. Its seed/count never feed back into symbolic compilation. Infinite plotting windows use a numerical tail target, and displayed moments may be approximated from bin masses. These are visualization settings, not changes to the mathematical model.

## Versioning and export

Each new commit records `model.json`, the SysML draft `model.sysml`, and `model.symbolic.json`. Existing graphs are recompiled with the current symbolic engine; old Git history is preserved. SysML is not yet the executable or semantically validated source of truth.

Python and Julia exports contain the same symbolic equation DAG, source identities, finite state expansion, original custom port definitions, and all observation nodes. Numerical plotting is a separate function. Their source laws use deterministic CDF/PMF evaluation, not upstream random draws. Symbolic laws outside the numerical plotting limits remain inspectable.
