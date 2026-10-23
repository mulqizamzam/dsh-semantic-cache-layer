# Changelog

## 0.2.1-rc.2

- Initial DSH-native port of the semantic cache concept.
- Add DSH `llm/stream` middleware with explicit opt-in embedding endpoint, conservative text-only response eligibility, route/system/generation-setting isolation, and fail-open embedding errors.
- Add a bounded in-memory cosine-similarity cache with TTL, LRU-style eviction, namespace isolation, and vector input validation.
- Add DSH tools for manual lookup/store, process statistics, and confirmation-gated clearing.
- Add DSH Skills provider configuration, beginner-focused installation and privacy documentation, test suite, package verifier, and CI workflow.
- Explicitly omit unsupported Redis persistence, FastAPI routes, direct Gemini/OpenAI completion proxying, and claims of guaranteed savings.
