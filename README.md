# Chaos Lab

A local-first visual exploration environment for chaotic systems. The static site bundles all runtime libraries and stores each visitor's Git repository in IndexedDB. Working tabs and recoverable closed drafts are stored in localStorage.

## Develop and verify

```sh
npm install
npm run build
npm run check
```

Serve `dist/` with a static HTTP server. No application server or environment secrets are required. Deploy identity is in `.openai/hosting.json`.

## Implemented

- 41 blocks across random sources, custom functions, standard math, symbolic calculus, combinatorics, logic, dynamics, and distribution taps.
- Drag-and-drop nodes, click-to-connect ports, editable parameters and expressions, pan/zoom, multi-selection, copy/paste, and per-tab undo/redo.
- Reproducible ensemble sampling with a seed and explicit iteration count. Feedback goes through a Unit delay block.
- Nerdamer symbolic expression compilation, derivatives, antiderivatives, and custom functions.
- Git blobs, trees, commits, and branch refs written by isomorphic-git to LightningFS/IndexedDB. Each commit records `model.json` and `model.sysml` and includes the model name, seed, block count, and sample count in its message.
- An ancestry-based Git graph, branch creation, historical commit tabs, side-by-side comparison, and cross-tab block copy/paste. Saving a historical revision automatically creates a new branch to preserve existing branch heads.
- A portable tar export including `.git`; verified with native `git fsck --full`.
- JSON and SysML draft export. Example history is initialized on first visit.

## Current boundaries

This is a functional prototype. SysML is a generated textual representation, not a validated or executable SysML 2.0 implementation. The executable graph remains in JSON. Full SysML interchange/import, symbolic probability-density propagation, advanced solvers, and remote Git authentication/sync are not implemented. Beta sampling currently accepts positive integer shape parameters. A visitor's model repository is device-local; export it before clearing browser data. Remote Git can be used with the downloaded repository through standard Git tooling.

Unit tests cover the simulation, symbolic transformations, error handling, Git object storage, branches, and export. A DOM interaction smoke test covers the primary editing and versioning flows. Browser rendering QA was unavailable in the build session because no `cua_repl.js` tool was offered.
