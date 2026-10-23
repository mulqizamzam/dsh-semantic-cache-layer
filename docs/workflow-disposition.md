# Source conversion and workflow disposition

Inspected source ref: `aaravrai2006-svg/semantic-cache-layer@ee4361dcbff28db438ea3f8111869bb2bba092b9`.

| Candidate | Disposition | Evidence / decision |
|---|---|---|
| Cosine similarity helper | `compile_skill` / implemented runtime helper | Source has `_cosine_similarity` and an embedding-vector lookup; reimplemented in `src/semantic-cache.js` with dimension/finite/zero-vector validation. |
| In-memory prompt/embedding/response store | `preserve_skill` / implemented runtime | Source has an in-process dictionary. Port adds namespaces, bounded capacity, TTL, and LRU-like recency. |
| FastAPI proxy | `discard` as unsupported claim | No application or route code exists in inspected source files. |
| Redis persistence/vector index | `discard` as unsupported claim | No Redis dependency or code exists in source. Cache remains process-local. |
| Embedding creation | `runtime_dependency` | Source requires caller-supplied embeddings. DSH auto-cache optionally calls a user-configured compatible embedding endpoint; no endpoint is configured by default. |
| Gemini/OpenAI completion proxy | `discard` as unsupported claim | No provider proxy client code exists. DSH's configured provider continues to serve cache misses. |
| Developer setup/debugging | `compile_skill` | `skills/semantic-cache-operations/SKILL.md` documents runtime setup, stats, namespace checks, failure handling and privacy boundaries. |

Public safety: the source repo contained only `.gitignore`, `README.md`, `cache_proxy.py`, and `requirements.txt`; API metadata reported no license and no `LICENSE` file was present. The DSH implementation was authored separately and no source implementation was copied verbatim. No source credentials or environment secrets were present in the inspected file set.

Architecture: native DSH Cordis plugin plus an optional DSH Skill provider. No remote MCP server. The model-stream hook is short-circuiting middleware, and the plugin uses `@deepseek-ai/dsh-tools` tools for caller-supplied embedding operations.
