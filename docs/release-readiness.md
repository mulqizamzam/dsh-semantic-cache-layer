# Release-readiness record

## Release metadata

- Package: `dsh-semantic-cache-layer`
- Candidate version: `0.2.1-rc.2`
- Host compatibility target: DeepSeek Harness `0.2.1-rc.2`
- Suggested GitHub Description: `Native DSH semantic response cache with cosine similarity, optional embeddings, and safe cache diagnostics.`
- Visibility target: public
- Package type: native DSH Cordis plugin with a DSH Skill provider; no MCP server is bundled.

## Completed local gates

- Unit tests via Node's built-in `node --test`.
- Syntax checks for the entry point and runtime source.
- Metadata, package file tree, Skill front matter, and square icon checks via `scripts/verify-package.mjs`.
- `npm pack --dry-run` archive inventory.
- Source-conversion disposition and limitation documentation.

## External / unavailable gates

- The execution environment supplied Node.js `22.16.0`, below DSH's required `^22.19.0 || >=24.0.0`. Tests passed but were not run with an engine version satisfying the target minimum.
- No live DSH `0.2.1-rc.2` process was available for installation/end-to-end middleware testing. Follow `docs/integration-smoke-test.md` on the target runtime.
- The GitHub repository now exists and is public, and the connected account has push permission. The execution container cannot resolve `github.com`, so Git transport push is unavailable. Files are being committed through the authenticated GitHub API; verify the final branch and tag before declaring publication complete.
- No GitHub tag/release creation tool is exposed through the connected action surface. The local annotated tag exists in the supplied Git bundle; a remote tag/release needs an available Git transport or tag/release-capable API.

## Release status boundary

Local package and unit-test gates passed. This record does not claim a live DSH smoke test or GitHub release/tag until those steps are executed and verified.
