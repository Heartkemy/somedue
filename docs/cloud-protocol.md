# Optional Things Cloud behavior

Somedue's Things Cloud integration is experimental and unofficial. It is not a
replacement for Things, and no live-account or cross-device compatibility is
guaranteed.

## Credential and transport safety

- Cloud passwords and history capabilities belong in macOS Keychain, never in the
  task database, frontend storage, command arguments, or diagnostic logs.
- Account switches keep credentials, cached history, and pending changes separate.
- Network requests require TLS, validate the account response before syncing, and
  present sanitized error classes instead of response bodies or capability URLs.
- Rate limiting produces a visible backoff state; it does not trigger immediate
  repeated retries.

## Sync and write safety

- History pages are replayed in commit order into a candidate state. State and its
  cursor are saved only after the complete delta is valid.
- Missing fields leave existing values unchanged; explicit null clears a value.
  Unknown fields are retained where possible. Unsupported entity versions or
  actions stop synchronization rather than risking a destructive rewrite.
- An outgoing change is synchronized against fresh history first. If a write has
  an uncertain result, Somedue reconciles it with authoritative history instead of
  automatically sending it again.
- Local drafts remain separate from authoritative cloud state so a conflict or a
  failed request cannot silently discard a user's edits.

## Data and compatibility limits

- Calendar-only dates are treated as calendar dates, not local-time timestamps.
- The app supports simple recurring tasks. Opaque or unsupported imported rules
  are retained and cannot be silently rewritten.
- Automated checks use synthetic data and fake HTTP services. They do not prove
  live authentication, service compatibility, or cross-device behavior.
