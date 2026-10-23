/** Bounded, process-local cosine-similarity cache. No disk or network access. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return null
  let scaleA = 0
  let scaleB = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i])
    const y = Number(b[i])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    scaleA = Math.max(scaleA, Math.abs(x))
    scaleB = Math.max(scaleB, Math.abs(y))
  }
  if (scaleA === 0 || scaleB === 0) return null
  let dot = 0
  let normA = 0
  let normB = 0
  // Scale first so large finite embedding dimensions do not overflow squares/dots.
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]) / scaleA
    const y = Number(b[i]) / scaleB
    dot += x * y
    normA += x * x
    normB += y * y
  }
  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  if (Math.abs(1 - score) < 1e-15) return 1
  if (Math.abs(-1 - score) < 1e-15) return -1
  return score
}

function validateEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) throw new TypeError('embedding must be a non-empty numeric array')
  const vector = embedding.map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('embedding values must be finite numbers')
    return value
  })
  if (vector.every((value) => value === 0)) throw new TypeError('embedding must not be a zero vector')
  return vector
}

function validateNamespace(namespace) {
  if (typeof namespace !== 'string' || !namespace.trim()) throw new TypeError('namespace must be a non-empty string')
  return namespace.trim()
}

export class SemanticCache {
  constructor({ threshold = 0.94, maxEntries = 500, ttlMs = 900000, now = () => Date.now() } = {}) {
    this.threshold = threshold
    this.maxEntries = Math.max(1, Math.trunc(maxEntries))
    this.ttlMs = Math.max(0, Math.trunc(ttlMs))
    this.now = now
    this.records = new Map()
    this.counters = { lookups: 0, hits: 0, stores: 0, evictions: 0, expirations: 0, invalidLookups: 0 }
  }

  #key(namespace, prompt) { return `${validateNamespace(namespace)}\u0000${String(prompt)}` }

  #expire(now) {
    if (this.ttlMs === 0) return
    for (const [key, record] of this.records) {
      if (now - record.createdAt >= this.ttlMs) {
        this.records.delete(key)
        this.counters.expirations += 1
      }
    }
  }

  lookup(embedding, { namespace = 'manual' } = {}) {
    this.counters.lookups += 1
    let vector
    try { vector = validateEmbedding(embedding) } catch { this.counters.invalidLookups += 1; return { hit: false, response: null, score: null, reason: 'invalid-embedding' } }
    const now = this.now()
    this.#expire(now)
    let best = null
    for (const [key, record] of this.records) {
      if (record.namespace !== namespace || record.embedding.length !== vector.length) continue
      const score = cosineSimilarity(vector, record.embedding)
      if (score !== null && score >= this.threshold && (best === null || score > best.score)) best = { key, record, score }
    }
    if (!best) return { hit: false, response: null, score: null, reason: 'no-match' }
    this.records.delete(best.key)
    best.record.lastAccessAt = now
    this.records.set(best.key, best.record)
    this.counters.hits += 1
    return { hit: true, response: best.record.response, score: best.score, reason: 'similarity-threshold-met' }
  }

  store(prompt, embedding, response, { namespace = 'manual' } = {}) {
    if (typeof prompt !== 'string') throw new TypeError('prompt must be a string')
    if (typeof response !== 'string') throw new TypeError('response must be a string')
    const vector = validateEmbedding(embedding)
    const cleanNamespace = validateNamespace(namespace)
    const key = this.#key(cleanNamespace, prompt)
    const now = this.now()
    this.#expire(now)
    this.records.delete(key)
    this.records.set(key, { namespace: cleanNamespace, prompt, embedding: vector, response, createdAt: now, lastAccessAt: now })
    this.counters.stores += 1
    while (this.records.size > this.maxEntries) {
      const oldestKey = this.records.keys().next().value
      this.records.delete(oldestKey)
      this.counters.evictions += 1
    }
    return { stored: true, entries: this.records.size, namespace: cleanNamespace }
  }

  clear(namespace) {
    if (namespace === undefined) {
      const removed = this.records.size
      this.records.clear()
      return { cleared: removed, scope: 'all' }
    }
    const cleanNamespace = validateNamespace(namespace)
    let cleared = 0
    for (const [key, record] of this.records) {
      if (record.namespace === cleanNamespace) { this.records.delete(key); cleared += 1 }
    }
    return { cleared, scope: cleanNamespace }
  }

  stats() {
    this.#expire(this.now())
    const namespaces = {}
    for (const record of this.records.values()) namespaces[record.namespace] = (namespaces[record.namespace] ?? 0) + 1
    return { ...this.counters, entries: this.records.size, maxEntries: this.maxEntries, threshold: this.threshold, ttlMs: this.ttlMs, namespaces }
  }
}
