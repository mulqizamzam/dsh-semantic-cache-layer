import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSemanticCachePlugin } from './src/plugin-runtime.js'

export const name = 'dsh-semantic-cache-layer'
export const inject = ['llm', 'tools']

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  autoCache: Schema.boolean().default(true),
  threshold: Schema.number().default(0.94),
  maxEntries: Schema.number().default(500),
  ttlMs: Schema.number().default(900000),
  embeddingEndpoint: Schema.string().default(''),
  embeddingModel: Schema.string().default('text-embedding-3-small'),
  embeddingApiKeyEnv: Schema.string().default('OPENAI_API_KEY'),
  requestTimeoutMs: Schema.number().default(4000),
  maxInputChars: Schema.number().default(24000),
  namespace: Schema.string().default('default'),
})

export function apply(ctx, config = {}) {
  installSemanticCachePlugin(ctx, config, defineTool)
}
