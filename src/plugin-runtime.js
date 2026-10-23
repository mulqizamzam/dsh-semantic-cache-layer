import { createHash } from 'node:crypto'
import { SemanticCache } from './semantic-cache.js'

const DEFAULTS = Object.freeze({
  enabled: true,
  autoCache: true,
  threshold: 0.94,
  maxEntries: 500,
  ttlMs: 900000,
  embeddingEndpoint: '',
  embeddingModel: 'text-embedding-3-small',
  embeddingApiKeyEnv: 'OPENAI_API_KEY',
  requestTimeoutMs: 4000,
  maxInputChars: 24000,
  namespace: 'default',
})

function normalizeConfig(raw = {}) {
  const config = { ...DEFAULTS, ...raw }
  if (!Number.isFinite(config.threshold) || config.threshold < -1 || config.threshold > 1) throw new RangeError('threshold must be between -1 and 1')
  for (const key of ['maxEntries', 'requestTimeoutMs', 'maxInputChars']) {
    if (!Number.isFinite(config[key]) || config[key] < 1) throw new RangeError(`${key} must be a positive number`)
    config[key] = Math.trunc(config[key])
  }
  if (!Number.isFinite(config.ttlMs) || config.ttlMs < 0) throw new RangeError('ttlMs must be zero or a positive number')
  config.ttlMs = Math.trunc(config.ttlMs)
  if (typeof config.embeddingEndpoint !== 'string' || typeof config.embeddingModel !== 'string' || typeof config.embeddingApiKeyEnv !== 'string') throw new TypeError('embedding endpoint, model, and key environment name must be strings')
  if (typeof config.namespace !== 'string' || !config.namespace.trim()) throw new TypeError('namespace must be a non-empty string')
  return config
}

function isSafeEmbeddingUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.username || url.password || url.hash || url.search) return false
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
  } catch { return false }
}

function canonicalRequest(options, config) {
  if (!options || typeof options.provider !== 'string' || !options.provider || typeof options.model !== 'string' || !options.model) return null
  if (!Array.isArray(options.messages) || options.messages.length === 0) return null
  if (options.purpose !== undefined || (Array.isArray(options.tools) && options.tools.length > 0) || options.toolHistory !== undefined) return null
  const messages = []
  for (const message of options.messages) {
    if (!message || typeof message.role !== 'string' || !Array.isArray(message.content)) return null
    const parts = []
    for (const block of message.content) {
      if (!block || block.type !== 'text' || typeof block.text !== 'string') return null
      parts.push(block.text)
    }
    messages.push({ role: message.role, content: parts.join('') })
  }
  const request = {
    cacheVersion: 1,
    provider: options.provider,
    model: options.model,
    embeddingModel: config.embeddingModel,
    reasoningEffort: options.reasoningEffort ?? null,
    temperature: options.temperature ?? null,
    maxTokens: options.maxTokens ?? null,
    stop: options.stop ?? null,
    system: options.system ?? null,
    messages,
  }
  const text = JSON.stringify(request)
  return text.length <= config.maxInputChars ? text : null
}

async function embed(text, config, counters) {
  if (!config.embeddingEndpoint.trim()) return null
  if (!isSafeEmbeddingUrl(config.embeddingEndpoint)) throw new Error('embeddingEndpoint must be an HTTPS URL or a loopback HTTP URL without credentials or a fragment')
  const headers = { 'content-type': 'application/json' }
  if (config.embeddingApiKeyEnv) {
    const key = process.env[config.embeddingApiKeyEnv]
    if (!key) throw new Error(`embedding API key environment variable ${config.embeddingApiKeyEnv} is unset`)
    headers.authorization = `Bearer ${key}`
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('embedding request timed out')), config.requestTimeoutMs)
  try {
    counters.embeddingRequests += 1
    const response = await fetch(config.embeddingEndpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ model: config.embeddingModel, input: text }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`embedding endpoint returned HTTP ${response.status}`)
    const body = await response.json()
    const vector = body?.data?.[0]?.embedding
    if (!Array.isArray(vector) || vector.length === 0 || vector.some(value => typeof value !== 'number' || !Number.isFinite(value)) || vector.every(value => value === 0)) {
      throw new Error('embedding endpoint returned an invalid embedding vector')
    }
    return vector
  } finally { clearTimeout(timer) }
}

function automaticNamespace(options, config) {
  const fixedContext = {
    system: options.system ?? null,
    systemMessages: options.messages.filter(message => message.role === 'system').map(message => ({
      role: message.role,
      content: message.content.map(block => block.text).join(''),
    })),
    reasoningEffort: options.reasoningEffort ?? null,
    temperature: options.temperature ?? null,
    maxTokens: options.maxTokens ?? null,
    stop: options.stop ?? null,
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(fixedContext)).digest('hex').slice(0, 16)
  return `auto:${config.namespace}:${options.provider}:${options.model}:${config.embeddingModel}:${fingerprint}`
}

function asTextResponse(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function extractCacheableText(chunks) {
  let started = false
  let ended = false
  let finished = false
  let deltaText = ''
  let endText = null
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]
    if (!chunk || typeof chunk.type !== 'string' || finished) return null
    if (chunk.type === 'block-start') {
      if (started || chunk.index !== 0 || chunk.blockType !== 'text') return null
      started = true
    } else if (chunk.type === 'text-delta') {
      if (!started || ended || chunk.index !== 0 || typeof chunk.text !== 'string') return null
      deltaText += chunk.text
    } else if (chunk.type === 'block-end') {
      if (!started || ended || chunk.index !== 0 || chunk.block?.type !== 'text' || typeof chunk.block.text !== 'string') return null
      ended = true
      endText = chunk.block.text
    } else if (chunk.type === 'usage') {
      // Usage is allowed between the text block and finish.
      if (!started || !ended) return null
    } else if (chunk.type === 'finish') {
      if (!started || !ended || i !== chunks.length - 1 || chunk.reason?.kind !== 'stop') return null
      finished = true
    } else return null
  }
  if (!started || !ended || !finished || !endText || endText !== deltaText) return null
  return endText
}

function schema(properties) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  }
}

function registerTools(ctx, cache, counters, defineTool, config) {
  ctx.tools.register(defineTool({
    name: 'dsh_scl_lookup',
    description: 'Look up a caller-supplied embedding vector in the process-local semantic cache. Does not call an embedding provider or read files.',
    parameters: {
      embedding: { type: 'array', items: { type: 'number' }, required: true, description: 'Numeric vector to compare with stored vectors.' },
      namespace: { type: 'string', description: 'Cache namespace; defaults to manual.' },
    },
    output: { schema: schema({ hit: { type: 'boolean' }, response: { oneOf: [{ type: 'string' }, { type: 'null' }] }, score: { oneOf: [{ type: 'number' }, { type: 'null' }] }, reason: { type: 'string' } }), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args) { return cache.lookup(args.embedding, { namespace: args.namespace ?? 'manual' }) },
  }))

  ctx.tools.register(defineTool({
    name: 'dsh_scl_store',
    description: 'Store a supplied prompt, numeric embedding, and response in the process-local semantic cache. It does not call model or embedding APIs.',
    parameters: {
      prompt: { type: 'string', required: true },
      embedding: { type: 'array', items: { type: 'number' }, required: true },
      response: { type: 'string', required: true },
      namespace: { type: 'string', description: 'Cache namespace; defaults to manual.' },
    },
    output: { schema: schema({ stored: { type: 'boolean' }, entries: { type: 'number' }, namespace: { type: 'string' } }), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args) { return cache.store(args.prompt, args.embedding, args.response, { namespace: args.namespace ?? 'manual' }) },
  }))

  ctx.tools.register(defineTool({
    name: 'dsh_scl_stats',
    description: 'Show semantic cache counts for the current DSH process. Entries and counters reset when that process restarts.',
    parameters: {},
    output: { schema: schema({ stats: { type: 'object' }, automaticCachingEnabled: { type: 'boolean' }, embeddingConfigured: { type: 'boolean' }, embeddingRequests: { type: 'number' }, embeddingFailures: { type: 'number' }, automaticCacheSkips: { type: 'number' } }), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute() { return { stats: cache.stats(), automaticCachingEnabled: config.enabled && config.autoCache && Boolean(config.embeddingEndpoint.trim()), embeddingConfigured: Boolean(config.embeddingEndpoint.trim()), embeddingRequests: counters.embeddingRequests, embeddingFailures: counters.embeddingFailures, automaticCacheSkips: counters.automaticCacheSkips } },
  }))

  ctx.tools.register(defineTool({
    name: 'dsh_scl_clear',
    description: 'Clear semantic cache entries. Requires confirm="clear". Omitting namespace clears every namespace in this DSH process.',
    parameters: {
      confirm: { type: 'string', required: true, description: 'Must be the literal string clear.' },
      namespace: { type: 'string', description: 'Optional namespace to clear; omit to clear every namespace.' },
    },
    output: { schema: schema({ cleared: { type: 'number' }, scope: { type: 'string' } }), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args) {
      if (args.confirm !== 'clear') throw new Error('Cache clear not performed. Pass confirm="clear" to acknowledge this destructive action.')
      return cache.clear(args.namespace)
    },
  }))
}

export function installSemanticCachePlugin(ctx, rawConfig = {}, defineTool) {
  if (typeof defineTool !== 'function') throw new TypeError('dsh-semantic-cache-layer requires the DSH defineTool API')
  const config = normalizeConfig(rawConfig)
  const cache = new SemanticCache(config)
  const counters = { embeddingRequests: 0, embeddingFailures: 0, automaticCacheSkips: 0 }
  let lastWarningAt = 0

  ctx.on('llm/stream', function (options, next) {
    return (async function* () {
      if (!config.enabled || !config.autoCache) { yield* next(); return }
      const requestText = canonicalRequest(options, config)
      if (requestText === null || !config.embeddingEndpoint.trim()) {
        counters.automaticCacheSkips += 1
        yield* next()
        return
      }

      let vector
      try {
        vector = await embed(requestText, config, counters)
      } catch (error) {
        counters.embeddingFailures += 1
        const now = Date.now()
        if (now - lastWarningAt > 30000) {
          lastWarningAt = now
          ctx.logger?.warn?.(`dsh-semantic-cache-layer: embedding unavailable; passing request through unchanged (${String(error?.message ?? error)})`)
        }
        yield* next()
        return
      }
      if (!vector) { counters.automaticCacheSkips += 1; yield* next(); return }

      const namespace = automaticNamespace(options, config)
      const cached = cache.lookup(vector, { namespace })
      if (cached.hit) {
        yield* asTextResponse(cached.response)
        return
      }

      const chunks = []
      for await (const chunk of next()) {
        chunks.push(chunk)
        yield chunk
      }
      const outputText = extractCacheableText(chunks)
      if (outputText !== null) {
        try { cache.store(requestText, vector, outputText, { namespace }) }
        catch (error) { ctx.logger?.warn?.(`dsh-semantic-cache-layer: response was returned but not cached (${String(error?.message ?? error)})`) }
      }
    })()
  })

  registerTools(ctx, cache, counters, defineTool, config)
  return { cache, counters, config }
}

export const __test = { normalizeConfig, isSafeEmbeddingUrl, canonicalRequest, automaticNamespace, extractCacheableText, asTextResponse }
