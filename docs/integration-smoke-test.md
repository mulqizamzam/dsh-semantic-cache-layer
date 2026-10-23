# DSH integration smoke-test checklist

Run these checks on a real DSH `0.2.1-rc.2` installation before enabling automatic caching in a shared or production profile. Record the DSH build, Node.js version, profile name, and observations; do not treat unit tests as substitutes for live integration.

1. Install the plugin into a disposable test profile and restart DSH.
2. Verify `dsh-semantic-cache-layer` is present in `dsh --profile <profile> --dump-config` output.
3. Confirm the four explicit tools are visible: `dsh_scl_lookup`, `dsh_scl_store`, `dsh_scl_stats`, `dsh_scl_clear`.
4. Run store → lookup using a known vector and confirm the response and similarity score are returned. Verify a separate namespace has no match.
5. Verify `dsh_scl_clear` refuses an incorrect confirmation value; then clear the test namespace with `confirm="clear"`.
6. With no `embeddingEndpoint`, send a normal message and confirm model response still works and `embeddingRequests` remains zero.
7. Against a local test embeddings endpoint, verify a first eligible text request goes to configured LLM provider and a second equivalent request is served by cache. Keep test inputs non-sensitive.
8. Verify tool-calling messages, image/file content, auxiliary-purpose calls, failed provider calls, and interrupted streams are not cached.
9. Stop and restart DSH and confirm entries/counters reset. This is expected behavior, not persistence failure.
10. Check startup logs for config parsing, Skill filesystem dependency, and endpoint errors. Remove any test endpoint/key after test.

Pass criteria: steps 1–6 must work for basic install; steps 7–10 must work before claiming end-to-end semantic caching passed on target DSH runtime. If an endpoint is unavailable, mark steps 7–8 skipped/unverified rather than passing them.
