# DeepSeek Harness target contract

The plugin targets the `dsh-v0.2.1-rc.2` release contract rather than assuming a generic OpenAI-style extension interface.

## Contracts used

- Plugin package entry and Cordis configuration are declared in `package.json`, `index.js`, and `cordis.patch.yml`, following the DSH plugin package/bundle pattern.
- The runtime requires the native `llm` service and `tools` registry and registers a waterfall handler with `ctx.on('llm/stream', (options, next) => AsyncIterable<StreamChunk>)`.
- The handler uses `next()` to continue the original provider stream and emits the documented `block-start`, `text-delta`, `block-end`, and `finish` chunk shapes for eligible cache hits.
- The response tools use the DSH `defineTool` API, a JSON schema, and a text renderer.
- A companion Skill is loaded through `@deepseek-ai/dsh-skill-filesystem` configured in the DSH bundle.

## Pinned upstream references

- [DSH v0.2.1-rc.2 `package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/package.json) — version and Node.js target (`^22.19.0 || >=24.0.0`).
- [LLM streaming contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/subsystems/llm-streaming.md) — `llm/stream` waterfall contract.
- [GenerateOptions and StreamChunk types](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/llm/llm/src/types.ts) — request fields and chunk unions.
- [LLN adapter guide](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/user/develop/practice/llm-adapter.md) — text block and finish chunk examples.
- [DSH context-mode bundle pattern](https://github.com/mulqizamzam/dsh-context-mode/blob/main/cordis.patch.yml) — Skill filesystem provider wiring.

## Compatibility limits

The project does not vendor DSH internals and does not run DSH as a dependency in unit tests. The local test suite uses a mock Cordis context and mocked embeddings HTTP response. A real DSH install must validate dependency resolution, patch application, Skill discovery, and stream interception per [`integration-smoke-test.md`](integration-smoke-test.md).
