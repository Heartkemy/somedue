// Explicit dummy-account verification. Credentials come from environment, never arguments or output.
import { create } from '../src/model.ts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
let complete = false;
if (!process.env.SOMEDUE_TEST_EMAIL || !process.env.SOMEDUE_TEST_PASSWORD) throw Error('Provide the dummy account through secret environment variables.');
const dir = mkdtempSync(join(tmpdir(), 'things-cloud-smoke-'));
try {
  const changes = create('Task6', { tt: `Verification project ${Date.now()}`, tp: 1, st: 1 });
  if (Object.values(changes)[0].p.tr !== false) throw Error('Frontend trash contract regressed.');
  const file = join(dir, 'changes.json'); writeFileSync(file, JSON.stringify(changes));
  const result = spawnSync('/opt/homebrew/bin/cargo', ['run', '--offline', '--quiet', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'cloud_smoke', '--', file, join(dir, 'isolated.sqlite')], { cwd: root, env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', RUSTC: '/opt/homebrew/bin/rustc' }, encoding: 'utf8', timeout: 180000 });
  if (result.status !== 0) { process.stderr.write(result.stderr || `Cloud smoke process failed before execution (${result.error?.code || result.signal || result.status}).`); process.exitCode = 1; }
  else { complete = true; const receipt = JSON.parse(result.stdout.trim()); writeFileSync(join(root, 'out/cloud-smoke.json'), JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); }
} finally { if (complete) rmSync(dir, { recursive: true, force: true }); else console.error(`Isolated verification files retained at ${dir}; do not retry uncertain writes without reconciliation.`); }
