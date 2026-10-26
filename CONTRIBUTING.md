# Contributing

Keep changes focused. For substantial work, open an issue first so the intended
behavior is clear.

Create a Git Flow feature branch from `develop`:

```sh
git flow feature start short-description
```

Use conventional commit messages, for example `fix: preserve task ordering`.
Before opening a pull request, run the checks relevant to the change:

```sh
bun run build
bun test tests
bun run test:native
```

Run UI or Keychain checks when touching those areas. Use synthetic fixtures only:
never commit credentials, Cloud capabilities, personal task data, or generated
local receipts.
