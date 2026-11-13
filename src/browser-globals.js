// isomorphic-git's browser build expects Node's Buffer API.
// esbuild injects this import into modules that reference the free identifier.
export { Buffer } from 'buffer';
