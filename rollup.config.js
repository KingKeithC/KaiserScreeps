/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import clear from 'rollup-plugin-clear';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import screeps from 'rollup-plugin-screeps';
import typescript from 'rollup-plugin-typescript2';
import fileCfg from './screeps.json';

let CONFIG = {
  token: process.env.SCREEPS_TOKEN ?? (typeof 'token' === 'object' && 'token' in fileCfg ? fileCfg : null) ?? null,
  protocol: process.env.SCREEPS_PROTOCOL ?? 'https',
  hostname: process.env.SCREEPS_HOSTNAME ?? 'screeps.com',
  port: (process.env.SCREEPS_PORT && Number(process.env.SCREEPS_PORT)) ?? 443,
  path: process.env.SCREEPS_PATH ?? '/',
  dest: process.env.SCREEPS_DEST ?? null,
};

for (const k in CONFIG)
  if (CONFIG[k] === null) {
    console.log(`null Value for ${k} in CONFIG`);
    CONFIG = null;
    break;
  }

if (CONFIG === null) console.log('No destination specified - code will be compiled but not uploaded');

export default {
  input: 'src/Main.ts',
  output: { file: 'dist/main.js', format: 'cjs', sourcemap: true },

  plugins: [
    clear({ targets: ['dist'] }),
    resolve({ rootDir: 'src' }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json', include: ['**/*.ts'], exclude: [] }),
    screeps({ config: CONFIG, dryRun: CONFIG === null }),
  ],
};
