import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'scripts/native/keychain-helper.c');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const run = (command, args) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

export function stageKeychainHelper(resources, identity) {
  if (identity === '-') throw new Error('Stable Keychain helper requires a persistent code signing certificate.');
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const cache = path.join(homedir(), 'Library/Application Support/Somedue/keychain-helper');
  const version = createHash('sha256').update('v1\0').update(readFileSync(source)).digest('hex');
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const entry = path.join(cache, `${arch}-${identity}-${version}`);
  const binary = path.join(entry, 'somedue-keychain');
  const requirement = `identifier "io.somedue.keychain" and certificate leaf = H"${identity}"`;
  if (!existsSync(entry)) {
    const scratch = mkdtempSync(path.join(cache, '.build-'));
    try {
      const output = path.join(scratch, 'somedue-keychain');
      run('xcrun', ['clang', '-O2', '-Werror', '-Wno-deprecated-declarations', '-arch', arch, '-mmacosx-version-min=11.0', `-DSOMEDUE_SIGNER="${identity}"`, source, '-framework', 'Security', '-framework', 'CoreFoundation', '-o', output]);
      run('codesign', ['--force', '--sign', identity, '--identifier', 'io.somedue.keychain', '--options', 'runtime', '--timestamp=none', output]);
      writeFileSync(path.join(scratch, 'sha256'), digest(output));
      renameSync(scratch, entry);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
  if (lstatSync(entry).isSymbolicLink() || !lstatSync(binary).isFile() || lstatSync(binary).isSymbolicLink() || digest(binary) !== readFileSync(path.join(entry, 'sha256'), 'utf8')) throw new Error('Cached Keychain helper changed; refusing to replace its approved identity.');
  run('codesign', ['--verify', '--strict', '-R', `=${requirement}`, binary]);
  run('lipo', ['-verify_arch', arch, binary]);
  mkdirSync(resources, { recursive: true });
  copyFileSync(binary, path.join(resources, 'somedue-keychain'));
  return { sha256: digest(binary), sourceSha256: version, cache: binary };
}
