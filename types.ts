// src/types.ts

export interface ContextEntry {
  id: string
  tool: string
  args: Record<string, unknown>
  result: string
  project: string
  timestamp: number
  summary?: string
  embedding?: number[] // 384-dim vector for semantic search
}

export interface RetrievedContext {
  entries: ContextEntry[]
  tokenEstimate: number
}

export interface StoreOptions {
  tool: string
  args: Record<string, unknown>
  result: unknown
  project: string
}
