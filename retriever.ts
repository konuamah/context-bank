// src/retriever.ts
//
// Retrieval layer with semantic search using in-process embeddings.
// Falls back to keyword matching for entries without embeddings.

import type { ContextEntry, RetrievedContext } from "./types.js"
import { loadEntries } from "./store.js"
import { generateEmbedding, cosineSimilarity } from "./embeddings.js"

const TOP_K = 8 // max entries to return
const TOKEN_CAP = 1200 // rough token budget for injected context

// Rough token estimator: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Score an entry against a query using semantic similarity or keyword fallback
async function scoreEntry(
  entry: ContextEntry,
  query: string,
  queryEmbedding: number[]
): Promise<number> {
  // Semantic scoring (if entry has embedding and query embedding succeeded)
  if (
    entry.embedding &&
    entry.embedding.length > 0 &&
    queryEmbedding.length > 0
  ) {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding)

    // Recency bonus
    const ageMs = Date.now() - entry.timestamp
    const ageHours = ageMs / (1000 * 60 * 60)
    const recencyScore = Math.max(0, 1 - ageHours / 48)

    // Weighted: semantic similarity (0-1) * 10 + recency
    // This makes semantic similarity the dominant factor
    return similarity * 10 + recencyScore * 0.5
  }

  // Fallback to keyword scoring for entries without embeddings
  const queryWords = query.toLowerCase().split(/\s+/)
  const target = [
    entry.tool,
    JSON.stringify(entry.args),
    entry.result,
    entry.summary ?? "",
  ]
    .join(" ")
    .toLowerCase()

  const keywordScore = queryWords.reduce((acc, word) => {
    return acc + (target.includes(word) ? 1 : 0)
  }, 0)

  const ageMs = Date.now() - entry.timestamp
  const ageHours = ageMs / (1000 * 60 * 60)
  const recencyScore = Math.max(0, 1 - ageHours / 48)

  return keywordScore * 2 + recencyScore * 0.5
}

export async function retrieve(
  query: string,
  project: string
): Promise<RetrievedContext> {
  const all = loadEntries(project)

  if (all.length === 0) {
    return { entries: [], tokenEstimate: 0 }
  }

  // Generate query embedding once
  const queryEmbedding = await generateEmbedding(query)

  // Score all entries (mix of semantic + keyword based on what's available)
  const scoredPromises = all.map(async (e) => ({
    entry: e,
    score: await scoreEntry(e, query, queryEmbedding),
  }))

  const scored = await Promise.all(scoredPromises)

  const candidates = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map((x) => x.entry)

  // Fallback to most recent if no matches
  const selected = candidates.length > 0 ? candidates : all.slice(-4)

  // Apply token budget
  let budget = TOKEN_CAP
  const final: ContextEntry[] = []

  for (const entry of selected) {
    const entryText = `${entry.tool}: ${entry.result}`
    const tokens = estimateTokens(entryText)
    if (budget - tokens < 0) break
    final.push(entry)
    budget -= tokens
  }

  return {
    entries: final,
    tokenEstimate: TOKEN_CAP - budget,
  }
}
