# Release-readiness record

## Release metadata

- Package: `dsh-semantic-cache-layer`
- Package version: `0.2.1-rc.2`
- Host compatibility target: DeepSeek Harness `0.2.1-rc.2`
- Repository: public `mulqizamzam/dsh-semantic-cache-layer`
- Source intended for this install: `github:mulqizamzam/dsh-semantic-cache-layer#main`
- Suggested GitHub Description: `Native DSH semantic response cache with cosine similarity, optional embeddings, and safe cache diagnostics.`

## Recent installation failure and fix

A running DSH UI reported the main `dsh-semantic-cache-layer` component as `Not running` while the separate Skill filesystem provider was running. Code inspection found that the plugin registered unsupported raw output JSON schemas through `@deepseek-ai/dsh-tools`: type arrays (for example `type: ['string', 'null']`) and nested property-level `required: true`. The DSH v0.2.1-rc.2 JSON Schema contract supports a single type per node, nullable unions with `oneOf`, and a `required: string[]` at the object node. Schema validation can throw during `apply()`, preventing plugin startup.

The runtime now uses supported JSON Schema shapes; the unit-test `defineTool` fixture validates those schema constraints so this failure class is detected before merge. The package also declares direct DSH runtime dependencies in both peerDependencies and devDependencies, following the DSH plugin-install contract.

## Verified results

- CI on the source commit before the documentation follow-ups passed on Node.js `22.19.0`: package verification, unit tests, syntax checks, and `npm pack --dry-run`.
- The post-fix unit suite includes schema-compatibility checks in addition to cache, middleware bypass, embeddings, and tool behavior tests.
- The source branch `main` contains the patched plugin runtime and updated docs.
- The already-published Git tag `v0.2.1-rc.2` still points to the original tagged commit, which predates this schema fix. Installs pinned to `#main` should update their branch checkout/profile lockfile to receive the fix; do not assume the old tag contains it.

## Remaining checks and limitations

- The user must update/reinstall the branch-based bundle in their actual profile and restart DSH to confirm the component changes from `Not running` to running.
- No direct access to the user's runtime startup log is available in this task. If it remains stopped after update, inspect DSH startup logs and share the error around the plugin load.
- No live session was available here for an end-to-end DSH installation smoke test; see `docs/integration-smoke-test.md`.
- The repository Description field may still need updating in GitHub settings: `Native DSH semantic response cache with cosine similarity, optional embeddings, and safe cache diagnostics.`

## Status boundary

The schema-startup defect was identified and fixed on `main`, and regression tests were added. Passing repository CI validates the package-level schema constraints; the final confirmation is the user's DSH profile loading the new main-branch commit successfully.
