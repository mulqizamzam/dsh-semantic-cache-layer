# DSH Semantic Cache Layer

**A native DeepSeek Harness plugin for bounded, cosine-similarity response caching.** Target runtime: DeepSeek Harness `0.2.1-rc.2`. Plugin package version: `0.2.1-rc.2`.

The plugin hooks the DSH `llm/stream` pipeline. When automatic caching is explicitly configured with an embeddings endpoint, it embeds eligible requests, checks for a sufficiently similar cached response, and returns a response from memory on a hit. Successful misses are cached only when they finish as one plain text block. Tool calls, auxiliary model calls, non-text messages, errors, partial streams, and non-stop finishes are passed through and not cached.

> **Important:** The cache is in-memory and local to one DSH process. It is volatile and is not Redis. By default, no embeddings endpoint is configured, so automatic caching performs no outbound network request. Choose and configure an embeddings service deliberately before enabling it.

## What it does

- DSH-native middleware on `llm/stream` for semantic response reuse.
- Cosine similarity with configurable threshold (default `0.94`).
- Bounded LRU-style in-memory entries, namespace isolation, and configurable TTL.
- Conservative automatic eligibility and complete-response checks.
- Fail-open behavior if embedding requests fail: the original DSH provider stream is allowed to continue.
- Explicit tools for storing and looking up caller-supplied vectors, checking statistics, and clearing cache entries with confirmation.
- A DSH Skill with installation and troubleshooting guidance.

## What it does not do

The original `semantic-cache-layer` repository contains a small Python `SemanticCache` class, but its README describes features not present in the source tree. This reconciled DSH port does **not** ship a FastAPI app, Redis/vector-store adapter, automatic embedding model implementation, Gemini/OpenAI completion proxy, disk persistence, cross-process cache, or guaranteed cost/latency savings. The plugin calls an embeddings endpoint only when explicitly configured; model completions still flow through DSH's configured provider.

## Prerequisites

- DeepSeek Harness `0.2.1-rc.2` (the package pins `engines.dsh` and its DSH peer dependencies to this exact release-candidate version).
- Node.js `^22.19.0` or `>=24.0.0`, matching the target DSH release.
- Network access to the package source when installing from GitHub.
- Optional: an OpenAI-compatible embeddings endpoint with a `POST /embeddings`-style contract, returning `data[0].embedding` as an array of finite numbers.

No runtime Redis, FastAPI, NumPy, or Python dependency is required by this DSH implementation.

## Install in DSH

Choose the profile that you actually use. The examples use `web`.

1. Confirm DSH is installed and starts:

   ```bash
   npx @deepseek-ai/dsh web
   ```

2. In a second terminal, add the plugin to that profile:

   ```bash
   dsh plugin --profile web add "github:mulqizamzam/dsh-semantic-cache-layer#main"
   ```

3. Stop and restart the DSH process using Ctrl+C, then:

   ```bash
   npx @deepseek-ai/dsh web
   ```

4. Check that the plugin appears in the merged configuration:

   ```bash
   dsh --profile web --dump-config | grep dsh-semantic-cache-layer
   ```

5. In DSH, call `dsh_scl_stats`. Initially, `embeddingConfigured` should be false. Automatic response caching should make no embedding network calls until an endpoint is configured. The manual lookup/store tools are available without an embeddings service.

If your installation command or plugin manager reports dependency/build-script prompts, review them before approval. Add the plugin separately to every profile where you need it.

## Enable automatic semantic caching

Automatic caching is conservative and should be opt-in after a privacy and correctness review. Edit the `dsh-semantic-cache-layer` config in the profile/bundle patch with the fields below. The bundled defaults are in [`cordis.patch.yml`](cordis.patch.yml).

| Setting | Default | Purpose |
|---|---|---|
| `enabled` | `true` | Master switch for automatic middleware; explicit tools remain registered. |
| `autoCache` | `true` | Enables automatic lookup/store logic when a valid endpoint is set. |
| `threshold` | `0.94` | Minimum cosine similarity to reuse a response; range `-1..1`. Higher is more conservative. |
| `maxEntries` | `500` | Maximum records across namespaces. Least-recently-used entries are evicted first. |
| `ttlMs` | `900000` | Entry lifetime in milliseconds; `0` disables expiration. |
| `embeddingEndpoint` | `""` | Full embeddings endpoint URL. Empty means automatic caching makes no network call. |
| `embeddingModel` | `text-embedding-3-small` | Model id sent in the embeddings request and cache namespace. |
| `embeddingApiKeyEnv` | `OPENAI_API_KEY` | Environment variable containing a bearer token. Set to `""` only for a trusted endpoint requiring no bearer token. |
| `requestTimeoutMs` | `4000` | Embedding request timeout. |
| `maxInputChars` | `24000` | Maximum canonical request size eligible for automatic caching. |
| `namespace` | `default` | Additional isolation namespace for automatic entries. |

### Embeddings endpoint and secrets

Set `embeddingEndpoint` to the provider's **full** HTTPS embeddings URL (for example, `https://your-provider.example/v1/embeddings`). The plugin does not append `/embeddings`. For local development, HTTP is accepted only for loopback host names/addresses such as `localhost` or `127.0.0.1`; non-loopback HTTP, URL credentials, query strings, and fragments are rejected so endpoint URLs cannot silently carry bearer secrets.

Provide the bearer key to the DSH process through the environment, not in a committed file:

```bash
export OPENAI_API_KEY="..."
npx @deepseek-ai/dsh web
```

Use your provider's actual key-variable name in `embeddingApiKeyEnv`. Do not commit `.env` files, keys, or request data. When automatic caching is enabled, the serialized eligible request is sent to the configured embeddings endpoint. This can include the full text conversation history, system text, provider/model identifiers, and generation settings—not just the newest user message. Review the endpoint’s retention and privacy policy first. Embedding failures are logged and fail open to the normal DSH provider. Automatic caching skips requests containing tools/tool-history, auxiliary-purpose calls, non-text blocks, over-limit inputs, and other ineligible shapes.

### Example config

A profile patch can configure this plugin approximately as follows; keep the YAML under the `dsh-semantic-cache-layer` plugin's own config rather than replacing unrelated profile configuration:

```yaml
- id: dsh-semantic-cache-layer
  name: dsh-semantic-cache-layer
  config:
    enabled: true
    autoCache: true
    threshold: 0.96
    maxEntries: 500
    ttlMs: 900000
    embeddingEndpoint: "https://your-provider.example/v1/embeddings"
    embeddingModel: "your-embedding-model"
    embeddingApiKeyEnv: "YOUR_EMBEDDING_API_KEY"
    requestTimeoutMs: 4000
    maxInputChars: 24000
    namespace: "work"
```

## Use the explicit cache tools

The tools operate on numeric vectors supplied by the caller; they do not generate vectors automatically. All entries live only for the current DSH process.

- `dsh_scl_store`: store a prompt, embedding vector, response, and optional namespace.
- `dsh_scl_lookup`: find the most similar eligible stored vector in a namespace.
- `dsh_scl_stats`: inspect entry counts, hits, stores, evictions, TTL expirations, automatic skips, and embeddings success/failure counts.
- `dsh_scl_clear`: clear one namespace or all namespaces. It requires `confirm="clear"` because it deletes cache entries.

Example tool arguments (illustrative only; embeddings must come from a compatible embedding model):

```json
{
  "prompt": "How do I list files in a directory?",
  "embedding": [0.81, 0.22, -0.41],
  "response": "Use the directory-listing command appropriate for your shell.",
  "namespace": "manual-demo"
}
```

Use the same embedding model and dimensions for vectors within a namespace. Do not mix vectors from different embedding models.

## Development and verification

Install a compatible Node.js version, then from the repository checkout run:

```bash
npm test
npm run check
npm run pack:check
```

The test suite uses Node's built-in test runner and mocks the DSH context / embeddings endpoint; it does not need a live DSH session or provider credentials. `npm run pack:check` runs a dry-run package inventory.

For a local profile install, use the absolute path to the checkout:

```bash
dsh plugin --profile web add "link:/absolute/path/to/dsh-semantic-cache-layer"
```

Restart DSH and verify the merged config. A passing unit test does not prove a live DSH installation; complete the [integration smoke-test checklist](docs/integration-smoke-test.md) on a real installation before treating a deployment as fully validated.

## Troubleshooting

- **No automatic hits:** Confirm `embeddingEndpoint` is not empty, `embeddingConfigured` is true, the exact DSH profile was restarted, and `dsh_scl_stats` shows successful embedding requests. Verify that the endpoint returns `data[0].embedding`.
- **Embedding key missing:** Check that the named environment variable is exported to the DSH process, not just an interactive terminal. Set `embeddingApiKeyEnv: ""` only for a trusted endpoint designed for unauthenticated use.
- **Unexpected matches:** Raise `threshold`, reduce TTL, narrow `namespace`, and use representative evaluations. Cosine similarity alone cannot prove semantic interchangeability.
- **No entries after a response:** Only a clean, completed, single plain-text answer with stop finish is stored. Tool calls, reasoning/non-text blocks, failures, interruptions, or alternate finishes are deliberately excluded.
- **Tools are missing:** Inspect startup logs, dependency/build-script approvals, `--dump-config`, and the Skill-filesystem peer dependency. Check the DSH version and restart the correct profile.
- **Data disappears after restart:** This cache is intentionally process-local and volatile; it is not a persistent database.

## Security and privacy

Prompt content is sent to the embeddings endpoint only when a valid endpoint is explicitly configured and the request is eligible. The plugin does not automatically read local files or write cache data to disk. Cache entries can contain prompts and responses in process memory, so use the clear tool appropriately and avoid cache use for sensitive or rapidly changing requests. Review embedding-provider terms, retention, and access controls before enabling it.

## Source lineage and license

This repository is an independent DSH-native implementation of the general semantic similarity cache idea. The source repository inspected for this port contained no `LICENSE` file and declared no SPDX/license field in repository metadata; consequently, this port does not copy its source files verbatim. New code in this repository is licensed under MIT; see [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md).
