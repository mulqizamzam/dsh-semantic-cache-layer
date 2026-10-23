import test from 'node:test'
import assert from 'node:assert/strict'
import { installSemanticCachePlugin, __test } from '../src/plugin-runtime.js'

function fakeContext() {
  const listeners = new Map()
  const tools = []
  const warnings = []
  return {
    listeners, registeredTools: tools, warnings,
    logger: { warn: message => warnings.push(message) },
    on(event, handler) { listeners.set(event, handler); return () => listeners.delete(event) },
    tools: { register(tool) { tools.push(tool) } },
  }
}
const defineTool = definition => definition
const options = { provider: 'test-provider', model: 'test-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }
const validChunks = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'hello world' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'hello world' } },
  { type: 'finish', reason: { kind: 'stop' } },
]

function mockFetch(vector, status = 200) {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return { ok: status >= 200 && status < 300, status, async json() { return { data: [{ embedding: vector }] } } }
  }
  return { calls: () => calls, restore: () => { globalThis.fetch = original } }
}

test('registers native llm/stream hook and explicit cache operation tools', async () => {
  const ctx = fakeContext()
  const result = installSemanticCachePlugin(ctx, {}, defineTool)
  assert.ok(ctx.listeners.has('llm/stream'))
  assert.deepEqual(ctx.registeredTools.map(tool => tool.name), ['dsh_scl_lookup', 'dsh_scl_store', 'dsh_scl_stats', 'dsh_scl_clear'])
  assert.ok(ctx.registeredTools.every(tool => typeof tool.output?.render === 'function'))
  assert.equal(result.cache.stats().entries, 0)
  const statsTool = ctx.registeredTools.find(tool => tool.name === 'dsh_scl_stats')
  const stats = await statsTool.execute({})
  assert.equal(stats.automaticCachingEnabled, false)
  assert.equal(stats.embeddingConfigured, false)
})

test('automatic cache bypasses by default without an embeddings endpoint', async () => {
  const ctx = fakeContext()
  installSemanticCachePlugin(ctx, {}, defineTool)
  let invoked = 0
  const handler = ctx.listeners.get('llm/stream')
  const out = []
  for await (const chunk of handler(options, async function* () { invoked += 1; yield* validChunks })) out.push(chunk)
  assert.equal(invoked, 1)
  assert.deepEqual(out, validChunks)
})

test('first eligible request stores a clean text response and a semantic match bypasses provider', async () => {
  const ctx = fakeContext()
  const mock = mockFetch([1, 0])
  try {
    installSemanticCachePlugin(ctx, { embeddingEndpoint: 'http://127.0.0.1:9999/v1/embeddings', embeddingApiKeyEnv: '' }, defineTool)
    const handler = ctx.listeners.get('llm/stream')
    let providerCalls = 0
    const next = async function* () { providerCalls += 1; yield* validChunks }
    const first = []
    for await (const chunk of handler(options, next)) first.push(chunk)
    const second = []
    for await (const chunk of handler(options, next)) second.push(chunk)
    assert.equal(providerCalls, 1)
    assert.deepEqual(first, validChunks)
    assert.deepEqual(second, validChunks)
    assert.equal(mock.calls(), 2)
  } finally { mock.restore() }
})

test('does not cache tool calls, reasoning, non-stop finishes, or interrupted streams', async () => {
  const ctx = fakeContext()
  const mock = mockFetch([1, 0])
  try {
    installSemanticCachePlugin(ctx, { embeddingEndpoint: 'https://embeddings.example/v1/embeddings', embeddingApiKeyEnv: '' }, defineTool)
    const handler = ctx.listeners.get('llm/stream')
    const toolChunks = [{ type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'finish', reason: { kind: 'tool-calls' } }]
    const next = async function* () { yield* toolChunks }
    for (let i = 0; i < 2; i += 1) { for await (const _ of handler(options, next)) {} }
    assert.equal(mock.calls(), 2)
    const brokenNext = async function* () { yield validChunks[0]; throw new Error('stream broke') }
    await assert.rejects(async () => { for await (const _ of handler(options, brokenNext)) {} }, /stream broke/)
    assert.equal(mock.calls(), 3)
  } finally { mock.restore() }
})

test('skips auxiliary purposes and calls that include tools or non-text content', async () => {
  const ctx = fakeContext()
  const mock = mockFetch([1, 0])
  try {
    installSemanticCachePlugin(ctx, { embeddingEndpoint: 'https://embeddings.example/v1/embeddings', embeddingApiKeyEnv: '' }, defineTool)
    const handler = ctx.listeners.get('llm/stream')
    let providerCalls = 0
    const next = async function* () { providerCalls += 1; yield* validChunks }
    for (const custom of [
      { ...options, purpose: 'compaction' },
      { ...options, tools: [{ name: 'bash' }] },
      { ...options, messages: [{ role: 'user', content: [{ type: 'image' }] }] },
    ]) for await (const _ of handler(custom, next)) {}
    assert.equal(providerCalls, 3)
    assert.equal(mock.calls(), 0)
  } finally { mock.restore() }
})

test('embedding failure falls through to the provider and emits bounded warnings', async () => {
  const ctx = fakeContext()
  const mock = mockFetch([], 503)
  try {
    installSemanticCachePlugin(ctx, { embeddingEndpoint: 'https://embeddings.example/v1/embeddings', embeddingApiKeyEnv: '' }, defineTool)
    const handler = ctx.listeners.get('llm/stream')
    let providerCalls = 0
    for (let i = 0; i < 2; i += 1) for await (const _ of handler(options, async function* () { providerCalls += 1; yield* validChunks })) {}
    assert.equal(providerCalls, 2)
    assert.equal(ctx.warnings.length, 1)
  } finally { mock.restore() }
})

test('URL policy accepts HTTPS and loopback HTTP only', () => {
  assert.equal(__test.isSafeEmbeddingUrl('https://api.example/v1/embeddings'), true)
  assert.equal(__test.isSafeEmbeddingUrl('http://localhost:3000/v1/embeddings'), true)
  assert.equal(__test.isSafeEmbeddingUrl('http://api.example/v1/embeddings'), false)
  assert.equal(__test.isSafeEmbeddingUrl('https://user:pass@api.example/v1/embeddings'), false)
  assert.equal(__test.isSafeEmbeddingUrl('https://api.example/v1/embeddings?api_key=secret'), false)
})

test('manual tools store, lookup, report stats, and require clear acknowledgement', async () => {
  const ctx = fakeContext()
  installSemanticCachePlugin(ctx, {}, defineTool)
  const get = name => ctx.registeredTools.find(tool => tool.name === name)
  const saved = await get('dsh_scl_store').execute({ prompt: 'question', embedding: [1, 0], response: 'answer' })
  assert.equal(saved.stored, true)
  const hit = await get('dsh_scl_lookup').execute({ embedding: [1, 0] })
  assert.equal(hit.response, 'answer')
  assert.equal(hit.reason, 'similarity-threshold-met')
  assert.equal((await get('dsh_scl_stats').execute({})).stats.entries, 1)
  await assert.rejects(get('dsh_scl_clear').execute({ confirm: 'no' }), /not performed/)
  assert.equal((await get('dsh_scl_clear').execute({ confirm: 'clear', namespace: 'manual' })).cleared, 1)
})

test('only a one-block successful text stream qualifies for automatic caching', () => {
  assert.equal(__test.extractCacheableText(validChunks), 'hello world')
  assert.equal(__test.extractCacheableText([{ ...validChunks.at(-1), reason: { kind: 'error' } }]), null)
  assert.equal(__test.canonicalRequest({ ...options, purpose: 'session-title' }, { embeddingModel: 'x', maxInputChars: 99999 }), null)
})

test('automatic cache partitions different generation settings and system prompts', () => {
  const config = { namespace: 'default', embeddingModel: 'embed-v1' }
  const baseline = __test.automaticNamespace(options, config)
  assert.notEqual(__test.automaticNamespace({ ...options, temperature: 0.5 }, config), baseline)
  assert.notEqual(__test.automaticNamespace({ ...options, system: 'another system prompt' }, config), baseline)
  assert.notEqual(__test.automaticNamespace({ ...options, model: 'other-model' }, config), baseline)
})
