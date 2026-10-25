import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'node_modules/playwright/package.json'), 'utf8'));
const result = spawnSync('docker', [
  'run', '--rm', '--init', '--ipc=host', '-v', `${root}:/work`, '-w', '/work',
  '-e', 'SOMEDUE_TEST_SERVER=python3 -m http.server 1422 --bind 127.0.0.1 --directory dist',
  `mcr.microsoft.com/playwright:v${version}-noble`,
  'node', 'node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2),
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
