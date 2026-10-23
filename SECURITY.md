# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository when it is enabled. Do not include API keys, private prompts, cached responses, or personal data in public issues. If private reporting is unavailable, open a minimal public issue asking for a private contact path without disclosing details.

## Security design

- No embedding request is made unless a valid endpoint is explicitly configured and the request meets the automatic-cache eligibility rules.
- Remote embeddings endpoints must use HTTPS. Plain HTTP is permitted only on loopback addresses. Endpoint URLs containing credentials, query strings, or fragments are rejected so the request cannot carry bearer secrets.
- API keys are read from the named environment variable and are not stored in the cache or logged by the plugin.
- Embedding errors fail open to the normal provider stream.
- Only one fully completed plain-text response ending with a normal stop is eligible for automatic storage.
- The cache exists in process memory and can hold prompts/responses until TTL expiry, eviction, explicit clear, or process shutdown.

These design choices reduce rock but do not replace a privacy review of the chosen embedding provider or the use of caching for sensitive / rapidly changing requests.
