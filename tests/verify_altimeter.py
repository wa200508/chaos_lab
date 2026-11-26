"""Independent water-level measurement audit. Run with NumPy and SciPy."""
import numpy as np
from scipy.integrate import quad
from scipy.optimize import brentq

rng = np.random.default_rng(20261126)
count = 1_000_000
gates = np.array([4., 5.])
truth = 4.5
# Four independent, unit-mean square-law looks. The graph uses their gamma law.
peak = np.zeros(count)
for _ in range(4):
    peak += (rng.normal(size=count)**2 + rng.normal(size=count)**2) / 8
clutter = rng.weibull(2, size=count)

for scale in [0., .04, .08]:
    powers = [peak * (.5 + (gate-truth)/2) + scale*clutter for gate in gates]
    fraction = (.5*peak - powers[0]) / (powers[1] - powers[0])
    reading = np.clip(gates[0] + fraction, *gates)
    if scale == 0:
        assert np.allclose(reading, truth, rtol=0, atol=1e-12)
        continue

    # Independently integrate the survival probability of the unclipped shift.
    def survival(d):
        return quad(lambda a: (4**4 / 6) * a**3 * np.exp(-4*a-(a*d/(2*scale))**2),
                    0, np.inf, epsabs=1e-11)[0]
    width = truth - gates[0]
    bias = -quad(survival, 0, width)[0]
    variance = quad(lambda d: 2*d*survival(d), 0, width)[0] - bias**2
    pinned = reading == gates[0]
    p_clip = survival(width)
    assert abs(np.mean(reading) - (truth+bias)) < 6*np.sqrt(variance/count)
    assert abs(np.mean(pinned)-p_clip) < 6*np.sqrt(p_clip*(1-p_clip)/count)
    assert abs(np.var(reading)-variance) < .00015
    qlo, qhi = [brentq(lambda d: survival(d)-p, 0, 4) for p in (.975,.025)]
    lower = np.where(pinned, gates[0], reading+qlo)
    upper = np.minimum(gates[1], reading+qhi)
    coverage = np.mean((lower<=truth) & (truth<=upper))
    # Upper-tail errors that censor to the near gate cease to exclude truth
    # when the upper confidence limit at that gate includes it.
    expected_coverage = .975 if width <= qhi else .95
    assert abs(coverage-expected_coverage) < .0015
    print(f'scale={scale:.2f} mean={reading.mean():.5f} variance={reading.var():.6f} '
          f'near_gate={pinned.mean():.5%} coverage={coverage:.5%}')
