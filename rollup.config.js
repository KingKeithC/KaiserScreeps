/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import clear from 'rollup-plugin-clear';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import screeps from 'rollup-plugin-screeps';
import typescript from 'rollup-plugin-typescript2';
import { readFileSync } from 'fs';

function readScreepsFile() {
  try {
    return JSON.parse(readFileSync('./screeps.json', 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function getScreepsSettings() {
  if (process.env.SCREEPS_BUILDONLY) return null;

  const branch = process.env.SCREEPS_BRANCH ?? process.env.SCREEPS_DEST ?? process.env.DEST ?? 'unkn';
  const branchSettings = (readScreepsFile() ?? {})[branch];

  let screepsSettings = {
    token: branchSettings?.token ?? process.env.SCREEPS_TOKEN ?? null,
    protocol: branchSettings?.protocol ?? process.env.SCREEPS_PROTOCOL ?? 'https',
    hostname: branchSettings?.hostname ?? process.env.SCREEPS_HOSTNAME ?? 'screeps.com',
    port: branchSettings?.port ?? (process.env.SCREEPS_PORT && Number(process.env.SCREEPS_PORT)) ?? 443,
    path: branchSettings?.path ?? process.env.SCREEPS_PATH ?? '/',
    branch: branchSettings?.branch ?? branch,
  };

  for (const k in screepsSettings)
    if (!screepsSettings[k]) {
      console.log(`null Value for ${k} in settings`);
      return null;
    }

  return screepsSettings;
}

let cfg;
if (!(cfg = getScreepsSettings())) console.log('No destination specified - code will be compiled but not uploaded');

export default {
  input: 'src/Main.ts',
  output: { file: 'dist/main.js', format: 'cjs', sourcemap: true },

  plugins: [
    clear({ targets: ['dist'] }),
    resolve({ rootDir: 'src' }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json', include: ['**/*.ts'], exclude: [] }),
    screeps({ config: cfg, dryRun: cfg === null }),
  ],
};
