# Alpha 2

Alpha 2 improves sync reliability in signed source builds and makes sync status
clearer throughout Somedue.

- Saved edits merge automatically into the latest Things Cloud state. Fields you
  changed take precedence; unrelated cloud changes are preserved.
- Edits already present in Things Cloud leave the upload queue automatically.
- Cloud recurring occurrences come from Things, avoiding competing local copies.
- Checklists remain editable when their task is completed or cancelled.
- Sync feedback stays below the toolbar, with retry and reconnect actions.
- Routine sync recovery no longer asks you to discard local edits.
- Updated frontend, native and build dependencies, including major-version API
  migrations covered by the automated tests.

## Dependency updates

- Solid 2.0.0, its separate web renderer and Vite plugin, and Lucide 1.74.0.
- Vite 8.3.8, TypeScript 7.0.2 and Playwright 1.65.1.
- Tauri 2.12.6, Reqwest 0.13.5, SQLite bindings 0.43.0 and SHA-1 0.11.0.
- Current stable direct dependencies and refreshed lockfiles. CI pins Node
  26.5.0, Bun 1.4.4 and Rust 1.99.1.

## Downloads and limitations

The downloadable Apple Silicon and Intel previews remain local-only, ad-hoc
signed and unnotarized. They cannot connect to Things Cloud or save credentials.
Experimental cloud sync requires a source build with the existing persistent
signing identity and Keychain helper. Updating through Homebrew installs the
local-only preview, not a cloud-enabled signed source build.

Unconfirmed uploads are checked before retrying, rather than blindly sent again.
Network failures can delay sync; saved edits remain on the Mac.

The declared minimum is macOS 13. Cross-build checks do not establish native
Intel or oldest-macOS runtime coverage. Keep backups of important tasks.
