# Contributing

## Development environment

Use Node.js `^22.19.0` or `>=24.0.0` and a DeepSeek Harness environment matching `0.2.1-rc.2`. The unit tests are based on Node's built-in test runner and do not require live DSH provider credentials.

## Before opening a change

```bash
npm test
npm run check
npm run pack:check
```

For runtime changes, add tests covering both the expected path and conservative skip/failure behavior. Do not weaken a safety gate solely to make a fixture pass. Keep automatic cache behavior opt-in at the network boundary and do not put tokens or production prompts into fixtures.

## Runtime integration

Use a disposable DSH profile and follow [`docs/integration-smoke-test.md`](docs/integration-smoke-test.md). Mark unavailable live checks as skipped/unverified; unit-test success does not prove a live host integration.

## Pull requests

Describe behavior changes, configuration changes, compatibility implications, tests actually run, and any remaining limitations. Update README and changelog when user-facing behavior changes.
