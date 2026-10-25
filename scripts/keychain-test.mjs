import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stageKeychainHelper } from './keychain-helper.mjs';

const root = path.resolve(import.meta.dirname, '..');
const identity = (process.env.SOMEDUE_CODESIGN_IDENTITY ?? readFileSync(path.join(homedir(), 'Library/Application Support/Somedue/macos-signing-identity'), 'utf8').trim()).toUpperCase();
if (!/^[A-F0-9]{40}$/.test(identity)) throw new Error('A persistent local certificate fingerprint is required.');
const scratch = mkdtempSync(path.join(tmpdir(), 'somedue-keychain-test-'));
const account = `verification-${randomUUID()}`;
const app = path.join(scratch, 'Probe.app');
const resources = path.join(app, 'Contents/Resources');
const bin = path.join(app, 'Contents/MacOS/probe');
const backup = path.join(app, 'Contents/MacOS/cleanup');
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
let created = false;
try {
  mkdirSync(path.join(scratch, 'src'), { recursive: true });
  mkdirSync(path.dirname(bin), { recursive: true });
  writeFileSync(path.join(scratch, 'Cargo.toml'), '[package]\nname="keychain-probe"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nsecurity-framework="3"\n');
  const probe = readFileSync(path.join(root, 'src-tauri/examples/keychain_probe.rs'), 'utf8')
    .replace('../src/keychain.rs', path.join(root, 'src-tauri/src/keychain.rs'));
  const source = path.join(scratch, 'src/main.rs');
  writeFileSync(source, probe);
  const build = () => {
    run('cargo', ['build', '--offline', '--manifest-path', path.join(scratch, 'Cargo.toml')], { env: { ...process.env, SOMEDUE_SIGNER: identity } });
    copyFileSync(path.join(scratch, 'target/debug/keychain-probe'), bin);
    run('codesign', ['--force', '--sign', identity, '--timestamp=none', '--identifier', 'io.somedue.desktop', bin]);
  };
  build();
  const firstCaller = digest(bin);
  const firstHelper = stageKeychainHelper(resources, identity);
  copyFileSync(bin, backup);
  run(bin, ['create', account]); created = true;
  run(bin, ['read', account]);
  run(bin, ['update', account]);
  run(bin, ['read-updated', account]);
  writeFileSync(source, probe.replace('Keychain synthetic verification passed:', 'Rebuilt caller verification passed:'));
  build();
  assert.notEqual(digest(bin), firstCaller, 'The caller executable must change for the continuity test.');
  const secondHelper = stageKeychainHelper(resources, identity);
  assert.equal(secondHelper.sha256, firstHelper.sha256, 'Packaging must retain helper signed bytes.');
  run(bin, ['read-updated', account]);
  let denied = false;
  try { run(path.join(resources, 'somedue-keychain'), ['get', account]); }
  catch (error) { denied = error.status !== 0; }
  assert.ok(denied, 'Direct shell/pipe helper use must be denied.');
  run('codesign', ['--force', '--sign', identity, '--timestamp=none', '--identifier', 'io.somedue.wrong-caller', bin]);
  denied = false;
  try { run(bin, ['read-updated', account]); }
  catch (error) { denied = error.status !== 0; }
  assert.ok(denied, 'A wrong caller identity must be denied.');
  run(backup, ['delete', account]); created = false;
  const receipt = { verifiedAt: new Date().toISOString(), identity, helperSha256: firstHelper.sha256, tests: ['native create', 'read after process restart', 'update', 'read updated', 'changed signed caller continuity', 'unchanged cached helper bytes', 'shell/pipe caller denied', 'wrong signed caller identity denied', 'delete and idempotent delete'], realCredentialsUsed: false };
  mkdirSync(path.join(root, 'out'), { recursive: true });
  writeFileSync(path.join(root, 'out/keychain-verification.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (created) {
    try { run(backup, ['delete', account]); }
    catch { console.error(`Synthetic verification item ${account} could not be removed; remove it in Keychain Access under io.somedue.desktop.things-cloud.v1.`); }
  }
  rmSync(scratch, { recursive: true, force: true });
}
