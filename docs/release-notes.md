Chaos Lab v2.0.0-beta.2 adds connected examples for water-level radar, RF receiver noise, shared manufacturing variation, and hydrogen orbitals.

- Open **New model → Radar · Water-level estimator** to inspect the received gate power, range estimate, and water level. The [walkthrough](https://github.com/wa200508/chaos_lab/blob/v2.0.0-beta.2/docs/examples/water-level-altimeter.md) includes a confidence interval, a clipping probability, and a reproducible million-acquisition audit.
- The range and elevation taps now preserve the mean of a collapsed distribution. A fixed 4.50 m reading displays 4.50 m with zero standard deviation. Clipped numerical laws use integration weights when calculating moments.
- Compare the stages in the Friis receiver, follow named uncertainty sources across subsystems, explore shared-source cancellation, or inspect the spatial marginal of a hydrogen orbital. Models, visualizations and script exports preserve their connected operations.
- Download the Windows x64 ZIP, Ubuntu DEB, EL9 RPM, portable Linux tarball or Docker image archive. SHA256SUMS.txt covers all five downloads. Windows binaries are unsigned.

Native packages include the dashboard and local server. The [README](https://github.com/wa200508/chaos_lab/blob/v2.0.0-beta.2/README.md#run-locally) gives the startup commands. Use the same browser profile, host, and port to reopen an existing local model repository.
