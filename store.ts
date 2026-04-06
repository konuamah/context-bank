// src/store.ts
//
// Simple JSON file store with semantic embeddings. Each project gets its own file under:
//   ~/.config/opencode/context-bank/<project-hash>.json
//
// Now generates embeddings for each entry to enable semantic search.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join, resolve } from "path"
import { randomUUID } from "crypto"
import type { ContextEntry, StoreOptions } from "./types.js"
import { generateEmbedding } from "./embeddings.js"

const MAX_ENTRIES = 300 // per project
const STORE_DIR = resolve(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".config/opencode/context-bank"
)

function ensureDir() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })
}

function projectKey(project: string): string {
  // Sanitize project path into a safe filename
  return project.replace(/[^a-zA-Z0-9]/g, "_").slice(-60)
}

function dbPath(project: string): string {
  return join(STORE_DIR, `${projectKey(project)}.json`)
}

function readDB(project: string): ContextEntry[] {
  const path = dbPath(project)
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ContextEntry[]
  } catch {
    return []
  }
}

function writeDB(project: string, entries: ContextEntry[]) {
  ensureDir()
  writeFileSync(dbPath(project), JSON.stringify(entries, null, 2))
}

export async function saveEntry(opts: StoreOptions): Promise<ContextEntry> {
  const entries = readDB(opts.project)

  // Prepare text for embedding: tool + args + result
  const embeddingText = [
    opts.tool,
    JSON.stringify(opts.args),
    typeof opts.result === "string"
      ? opts.result.slice(0, 500) // Cap for embedding
      : JSON.stringify(opts.result).slice(0, 500),
  ].join(" ")

  // Generate embedding (async)
  const embedding = await generateEmbedding(embeddingText)

  const entry: ContextEntry = {
    id: randomUUID(),
    tool: opts.tool,
    args: opts.args,
    result: typeof opts.result === "string"
      ? opts.result
      : JSON.stringify(opts.result).slice(0, 2000), // cap result size
    project: opts.project,
    timestamp: Date.now(),
    embedding: embedding.length > 0 ? embedding : undefined, // Only store if successful
  }

  entries.push(entry)

  // Prune to MAX_ENTRIES
  const pruned = entries.slice(-MAX_ENTRIES)
  writeDB(opts.project, pruned)

  return entry
}

export function loadEntries(project: string): ContextEntry[] {
  return readDB(project)
}

export function clearProject(project: string) {
  writeDB(project, [])
}

export function replaceEntries(project: string, entries: ContextEntry[]) {
  writeDB(project, entries)
}
