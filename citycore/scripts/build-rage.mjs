import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('release/ragemp/packages/citycore', { recursive: true });
await mkdir('release/ragemp/client_packages/citycore', { recursive: true });
await build({ entryPoints: ['ragemp/server/index.ts'], bundle: true, platform: 'node', target: 'node12', outfile: 'release/ragemp/packages/citycore/index.js', sourcemap: true });
await build({ entryPoints: ['ragemp/client/index.ts'], bundle: true, platform: 'browser', target: 'chrome80', outfile: 'release/ragemp/client_packages/citycore/index.js', sourcemap: true });
await writeFile('release/ragemp/client_packages/index.js', "require('./citycore/index.js');\n");
