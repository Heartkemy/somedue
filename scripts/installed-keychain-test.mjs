// Verify the actual installed release executable, without opening or mutating task data.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const app = '/Applications/Somedue.app';
const run = (command, args) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
const identity = readFileSync(path.join(homedir(), 'Library/Application Support/Somedue/macos-signing-identity'), 'utf8').trim().toUpperCase();
const bundleId = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(app, 'Contents/Info.plist')]).trim();
if (bundleId !== 'io.somedue.desktop') throw new Error('Unexpected installed application identity.');
const executableName = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', path.join(app, 'Contents/Info.plist')]).trim();
const executable = path.join(app, 'Contents/MacOS', executableName);
run('codesign', ['--verify', '--deep', '--strict', '-R', `=identifier "${bundleId}" and certificate leaf = H"${identity}"`, app]);
const helper = path.join(app, 'Contents/Resources/somedue-keychain');
run('codesign', ['--verify', '--strict', '-R', `=identifier "io.somedue.keychain" and certificate leaf = H"${identity}"`, helper]);
const account = `verification-installed-${randomUUID()}`;
const checks = [];
let created = false;
try {
  for (const operation of ['create', 'read', 'update', 'read-updated', 'delete']) {
    run(executable, ['--keychain-self-test', operation, account]);
    if (operation === 'create') created = true;
    if (operation === 'delete') created = false;
    checks.push(operation);
  }
  const receipt = { verifiedAt: new Date().toISOString(), installedPath: app, executable, identity, signatureVerified: true, helperSha256: createHash('sha256').update(readFileSync(helper)).digest('hex'), separateProcessChecks: checks, realCredentialsUsed: false, taskDatabaseOpened: false, cloudRequestsMade: false };
  mkdirSync(path.join(root, 'out'), { recursive: true });
  writeFileSync(path.join(root, 'out/installed-keychain-verification.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (created) {
    try { run(executable, ['--keychain-self-test', 'delete', account]); }
    catch { console.error(`Could not remove synthetic verification account ${account}; remove it from the io.somedue.desktop.things-cloud.v1 service in Keychain Access.`); }
  }
}
