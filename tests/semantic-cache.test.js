import test from 'node:test'
import assert from 'node:assert/strict'
import { SemanticCache, cosineSimilarity } from '../src/semantic-cache.js'

test('cosine similarity handles equal, opposite, zero and dimension-mismatched vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1)
  assert.equal(cosineSimilarity([1e308, 1e308], [1e308, 1e308]), 1)
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1)
  assert.equal(cosineSimilarity([0, 0], [1, 0]), null)
  assert.equal(cosineSimilarity([1, 0], [1]), null)
})

test('lookup returns the closest match over threshold only within the namespace', () => {
  const cache = new SemanticCache({ threshold: 0.9 })
  cache.store('a', [1, 0], 'A', { namespace: 'n' })
  cache.store('b', [0.95, 0.31], 'B', { namespace: 'n' })
  assert.equal(cache.lookup([1, 0], { namespace: 'n' }).response, 'A')
  assert.equal(cache.lookup([1, 0], { namespace: 'other' }).hit, false)
  assert.equal(cache.lookup([0, 1], { namespace: 'n' }).hit, false)
})

test('input validation rejects malformed vectors and non-string content', () => {
  const cache = new SemanticCache()
  assert.throws(() => cache.store('x', [0, 0], 'y'), /zero vector/)
  assert.throws(() => cache.store('x', [1, Infinity], 'y'), /finite numbers/)
  assert.throws(() => cache.store(1, [1], 'y'), /prompt must be a string/)
  assert.equal(cache.lookup([NaN]).reason, 'invalid-embedding')
})

test('evicts least-recently-used entries at capacity', () => {
  const cache = new SemanticCache({ threshold: 1, maxEntries: 2 })
  cache.store('a', [1, 0], 'A')
  cache.store('b', [0, 1], 'B')
  cache.lookup([1, 0])
  cache.store('c', [-1, 0], 'C')
  assert.equal(cache.lookup([0, 1]).hit, false)
  assert.equal(cache.stats().evictions, 1)
})

test('expires entries after TTL and clear supports one namespace or all namespaces', () => {
  let now = 100
  const cache = new SemanticCache({ ttlMs: 10, now: () => now })
  cache.store('a', [1, 0], 'A', { namespace: 'n' })
  cache.store('b', [0, 1], 'B', { namespace: 'm' })
  assert.equal(cache.clear('n').cleared, 1)
  now = 120
  assert.equal(cache.lookup([0, 1], { namespace: 'm' }).hit, false)
  assert.equal(cache.stats().expirations, 1)
  cache.store('c', [1, 1], 'C')
  assert.equal(cache.clear().cleared, 1)
})
