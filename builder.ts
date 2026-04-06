// src/builder.ts
//
// Context Builder: takes raw retrieved entries and formats them
// into a concise string safe to inject into the LLM prompt.
//
// This is the FILTER layer — it decides what actually enters the prompt.
// Keep this aggressive. Less context, injected well, beats everything.

import type { ContextEntry, RetrievedContext } from "./types.js"

// Tools that produce low-signal output — results truncated aggressively
const LOW_SIGNAL_TOOLS = new Set(["list_files", "search_files", "glob"])

function formatEntry(entry: ContextEntry): string {
  const time = new Date(entry.timestamp).toISOString().slice(11, 19) // HH:MM:SS
  const result = LOW_SIGNAL_TOOLS.has(entry.tool)
    ? entry.result.slice(0, 200) + (entry.result.length > 200 ? "…" : "")
    : entry.result.slice(0, 600) + (entry.result.length > 600 ? "…" : "")

  const argsStr = Object.keys(entry.args).length > 0
    ? ` (${JSON.stringify(entry.args).slice(0, 100)})`
    : ""

  return `[${time}] ${entry.tool}${argsStr}\n→ ${result}`
}

export function buildContext(retrieved: RetrievedContext): string {
  if (retrieved.entries.length === 0) return ""

  const lines = [
    "## Context Bank",
    `(${retrieved.entries.length} relevant entries, ~${retrieved.tokenEstimate} tokens)`,
    "",
    ...retrieved.entries.map(formatEntry),
  ]

  return lines.join("\n")
}

export function buildCompactionSummary(entries: ContextEntry[]): string {
  if (entries.length === 0) return ""

  // For compaction: summarize by tool type counts + last few results
  const toolCounts: Record<string, number> = {}
  for (const e of entries) {
    toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1
  }

  const toolSummary = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => `  - ${tool}: ${count}x`)
    .join("\n")

  const recent = entries.slice(-5).map(formatEntry).join("\n\n")

  return [
    "## Context Bank Summary",
    "",
    "### Tool usage this session:",
    toolSummary,
    "",
    "### Most recent actions:",
    recent,
  ].join("\n")
}
