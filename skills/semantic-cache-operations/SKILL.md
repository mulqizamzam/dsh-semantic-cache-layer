---
name: dsh-semantic-cache-operations
description: Use when installing, configuring, inspecting, troubleshooting, or safely operating the DSH Semantic Cache Layer, including validating cache hits and deciding whether semantic reuse is safe for a task.
---

# DSH Semantic Cache operations

## Scope and guarantees

This plugin caches only responses that pass its explicit eligibility rules. Automatic caching is useful for repeatable, text-only requests where approximate semantic reuse is acceptable. It is not suitable for private or highly contextual outputs, tool-use decisions, changing real-time facts, or requests whose answer must be freshly generated.

The cache is process-local, bounded, and volatile. Entries and counters reset when the DSH process restarts. Embeddings are not created locally by this plugin: automatic caching requires an explicitly configured OpenAI-compatible embeddings endpoint. Without that endpoint, the model stream passes through and the manual vector tools remain available.

## Setup workflow

1. Confirm the running host is DeepSeek Harness `0.2.1-rc.2` and Node.js is `^22.19.0` or `>=24.0.0`.
2. Install `dsh-semantic-cache-layer` into the exact DSH profile that will use it; restart that DSH process after profile changes.
3. Start with `embeddingEndpoint` empty to keep automatic caching disabled at the network boundary while validating the plugin.
4. Only after choosing an embeddings service and reviewing its data handling, set its full HTTPS `/embeddings` endpoint, model, and optional API-key environment variable.
5. Check `dsh_scl_stats` and verify the embedding request count increases only for eligible chat requests.

## Safe debugging

- Run `dsh_scl_stats` to see entry counts, hits, stores, evictions, expirations, embedding failures, and skips. Counters are process-local.
- A hit is returned only when cosine similarity meets the configured threshold and the provider/model/embedding-model namespace matches.
- Lowering the threshold can increase false semantic matches. Raise it for conservative reuse; verify expected outputs with representative prompts.
- `dsh_scl_lookup` and `dsh_scl_store` operate on supplied vectors only; they do not fetch embeddings or read files.
- `dsh_scl_clear` mutates cache state and requires the literal `confirm="clear"`. Omit `namespace` only when you intend to clear all namespaces for this process.
- Embedding-provider errors fail open: the request should continue to the configured LLM provider without automatic cache lookup. Investigate endpoint URL, network reachability, model name, timeout, and secret environment configuration.

## Boundaries

Do not treat semantic similarity as proof that two requests are interchangeable. Do not enable shared or remote caching for sensitive prompts without an explicit privacy review. The plugin does not persist entries, operate Redis, expose a FastAPI server, proxy Gemini/OpenAI completions directly, or guarantee token savings. Model-token savings are not estimated by this plugin.
