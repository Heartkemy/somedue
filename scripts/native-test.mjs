import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {homedir} from 'node:os';
execFileSync('cargo',['test','--offline','--manifest-path','src-tauri/Cargo.toml'],{cwd:path.resolve(import.meta.dirname,'..'),stdio:'inherit',env:{...process.env,CARGO_TARGET_DIR:process.env.CARGO_TARGET_DIR||path.join(homedir(),'Library/Caches/Somedue/cargo-target')}});
