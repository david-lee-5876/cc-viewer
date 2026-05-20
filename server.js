// Re-export shim — keeps `package.json` "main": "server.js" + `"."` exports
// working without forcing every external consumer to know the physical layout.
// Removing this file requires updating package.json + any user scripts that
// run `node server.js`. Implementation lives at server/server.js.
export * from './server/server.js';
