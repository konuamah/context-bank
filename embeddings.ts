// embeddings.ts
//
// In-process semantic embeddings using transformers.js
// No external server required - everything runs locally in Node.js

import { pipeline, env } from "@xenova/transformers"
import { resolve } from "path"

// Configure model cache location
const CACHE_DIR = resolve(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".config/opencode/context-bank/models"
)

env.localModelPath = CACHE_DIR
env.cacheDir = CACHE_DIR

// Model: all-MiniLM-L6-v2 - 384-dim, fast, good for code/technical text
const MODEL = "Xenova/all-MiniLM-L6-v2"

let embedderInstance: any = null
let initializationPromise: Promise<any> | null = null

/**
 * Get or initialize the embedding pipeline (singleton pattern)
 * First call downloads model (~23 MB), subsequent calls use cache
 */
async function getEmbedder() {
  if (embedderInstance) {
    return embedderInstance
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise
  }

  // Start initialization
  initializationPromise = (async () => {
    try {
      console.log("[context-bank] Initializing embedding model...")
      embedderInstance = await pipeline("feature-extraction", MODEL)
      console.log("[context-bank] Embedding model ready")
      return embedderInstance
    } catch (error) {
      console.error("[context-bank] Failed to initialize embedding model:", error)
      initializationPromise = null // Reset so it can be retried
      throw error
    }
  })()

  return initializationPromise
}

/**
 * Generate a 384-dimensional embedding vector from text
 * Returns empty array on failure for graceful degradation
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embedder = await getEmbedder()
    const output = await embedder(text, {
      pooling: "mean",
      normalize: true,
    })

    // Extract the embedding array from the tensor output
    return Array.from(output.data)
  } catch (error) {
    console.warn("[context-bank] Embedding generation failed:", error)
    return [] // Return empty array for graceful fallback to keyword search
  }
}

/**
 * Calculate cosine similarity between two embedding vectors
 * Returns 0-1 where 1 is identical and 0 is completely different
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}
