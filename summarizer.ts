// src/summarizer.ts
//
// Compression layer. Runs during session.compacting or can be called manually.
// Old entries (>24h) get their results truncated and flagged as summarized.
// This keeps the store lean without losing the "what happened" signal.

import type { ContextEntry } from "./types.js"
import { loadEntries, replaceEntries } from "./store.js"

const SUMMARIZE_AFTER_HOURS = 24
const SUMMARY_RESULT_CAP = 150 // chars to keep after summarization

function isOld(entry: ContextEntry): boolean {
  const ageMs = Date.now() - entry.timestamp
  return ageMs > SUMMARIZE_AFTER_HOURS * 60 * 60 * 1000
}

export function compressOldEntries(project: string): number {
  const entries = loadEntries(project)
  let compressed = 0

  const updated = entries.map((entry) => {
    if (entry.summary || !isOld(entry)) return entry

    compressed++
    return {
      ...entry,
      summary: `[compressed] ${entry.result.slice(0, SUMMARY_RESULT_CAP)}`,
      result: "", // clear full result to save space
    }
  })

  replaceEntries(project, updated)
  return compressed
}

export function getSessionSummary(project: string): string {
  const entries = loadEntries(project)
  if (entries.length === 0) return "No context bank entries for this project."

  const recent = entries.filter((e) => {
    const ageMs = Date.now() - e.timestamp
    return ageMs < 2 * 60 * 60 * 1000 // last 2 hours
  })

  const total = entries.length
  const recentCount = recent.length

  const tools = [...new Set(recent.map((e) => e.tool))].join(", ")

  return [
    `Total stored entries: ${total}`,
    `Recent (last 2h): ${recentCount}`,
    `Tools used recently: ${tools || "none"}`,
  ].join("\n")
}
