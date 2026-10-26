import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { stageKeychainHelper } from './keychain-helper.mjs';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const flags = new Set(process.argv.slice(2));
// Native archive mmap is unreliable on the VM shared workspace; compile on local APFS.
const cargoTarget = process.env.CARGO_TARGET_DIR || path.join(homedir(), 'Library/Caches/Somedue/cargo-target');
if ([...flags].some(flag => !['--install', '--skip-build'].includes(flag))) throw new Error('Usage: bun scripts/macos-package.mjs [--install] [--skip-build]');
if (process.platform !== 'darwin') throw new Error('Packaging requires macOS.');
if (flags.has('--install')) console.log('Building current working files, including uncommitted changes. Somedue will restart after installation; save open edits first.');
// Follow the reference: explicit override, persistent identity file, then honest local ad-hoc.
const identityFile = path.join(homedir(), 'Library/Application Support/Somedue/macos-signing-identity');
const identity = (process.env.SOMEDUE_CODESIGN_IDENTITY ?? (existsSync(identityFile) ? readFileSync(identityFile, 'utf8').trim() : '-')).toUpperCase();
if (identity !== '-' && !/^[A-F0-9]{40}$/.test(identity)) throw new Error('Signing identity must be a SHA-1 certificate fingerprint or explicit "-".');
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
if (identity !== '-') {
  const available = execFileSync('security', ['find-identity', '-p', 'codesigning'], { encoding: 'utf8' });
  if (!available.includes(identity)) throw new Error('Configured signing certificate unavailable; refusing ad-hoc fallback.');
}
if (!flags.has('--skip-build')) {
  run('bun', ['run', 'icons']);
  run('bun', ['run', 'tauri', 'build', '--bundles', 'app'], { env: { ...process.env, CARGO_TARGET_DIR: cargoTarget, ...(identity !== '-' ? { SOMEDUE_SIGNER: identity } : {}) } });
}
const app = path.join(cargoTarget, 'release/bundle/macos/Somedue.app');
if (!existsSync(app)) throw new Error(`Missing bundle: ${app}`);
const bundleId = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
if (bundleId !== 'io.somedue.desktop') throw new Error(`Unexpected bundle identity: ${bundleId}`);
const executableName = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
const executable = path.join(app, 'Contents/MacOS', executableName);
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
if (flags.has('--skip-build')) {
  const previous = JSON.parse(readFileSync(path.join(root, 'out/build-receipt.json'), 'utf8'));
  if (previous.identity !== identity || previous.executableSha256 !== digest(executable)) throw new Error('Cannot skip build: the existing binary has no matching package receipt and compile-time signing identity.');
}
run('bun', ['run', 'notices']);
const notices = path.join(root, 'out/THIRD_PARTY_NOTICES.md');
const bundledNotices = path.join(app, 'Contents/Resources/THIRD_PARTY_NOTICES.md');
copyFileSync(notices, bundledNotices);
if (digest(notices) !== digest(bundledNotices)) throw new Error('Bundled third-party notices do not match the generated source.');

const helper = identity === '-' ? null : stageKeychainHelper(path.join(app, 'Contents/Resources'), identity);
run('codesign', ['--force', '--sign', identity, '--timestamp=none', '--identifier', bundleId, app]);
run('codesign', ['--verify', '--deep', '--strict', app]);
if (helper && createHash('sha256').update(readFileSync(path.join(app, 'Contents/Resources/somedue-keychain'))).digest('hex') !== helper.sha256) throw new Error('Signing changed the frozen Keychain helper.');
const receipt = { executableSha256: digest(executable), keychainHelper: helper, builtAt: new Date().toISOString(), bundleId, app, signing: identity === '-' ? 'ad-hoc local build' : 'certificate signed local build', identity, notarized: false, keychainContinuityAcrossUpdatesVerified: false };
if (flags.has('--install')) {
  const destination = '/Applications/Somedue.app';
  const stage = `/Applications/.Somedue-staging-${process.pid}.app`;
  run('ditto', [app, stage]);
  run('codesign', ['--verify', '--deep', '--strict', stage]);
  if (existsSync(destination)) {
    const previousId = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(destination, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
    if (previousId !== bundleId) throw new Error('Existing installation has a different identity; refusing replacement.');
    const backupDir = path.join(homedir(), 'Library/Application Support/Somedue/installation-backups');
    mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `Somedue-${Date.now()}.app`);
    run('ditto', [destination, backup]);
    // macOS rename can replace an empty directory only; move existing bundle aside first.
    const retired = `/Applications/.Somedue-retired-${process.pid}.app`;
    renameSync(destination, retired);
    try { renameSync(stage, destination); }
    catch (error) { renameSync(retired, destination); throw error; }
    receipt.previousInstallation = retired;
    receipt.backup = backup;
  } else renameSync(stage, destination);
  run('codesign', ['--verify', '--deep', '--strict', destination]);
  if (digest(path.join(destination, 'Contents/MacOS', executableName)) !== receipt.executableSha256) throw new Error('Installed executable does not match the build.');
  receipt.installedPath = destination;
}
mkdirSync(path.join(root, 'out'), { recursive: true });
writeFileSync(path.join(root, 'out/build-receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
if (flags.has('--install')) {
  // Ask the existing instance to quit normally; never force-kill it or bypass a cancelled quit.
  run('osascript', ['-e', `
if application id "${bundleId}" is running then
  tell application id "${bundleId}" to quit
  repeat 100 times
    if not (application id "${bundleId}" is running) then exit repeat
    delay 0.1
  end repeat
  if application id "${bundleId}" is running then error "Somedue did not quit. Save your edits and quit it, then run the command again."
end if`], { timeout: 15000 });
  run('open', ['-a', receipt.installedPath]);
  console.log(`Installed and opened ${receipt.installedPath}`);
}
