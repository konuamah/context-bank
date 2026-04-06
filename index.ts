// src/index.ts
//
// OpenCode Context Bank Plugin
// ============================
// Hooks into tool execution to automatically:
//   1. Retrieve relevant past context before each tool call
//   2. Store tool results after each tool call
//   3. Inject compressed memory during session compaction
//
// Installation:
//   Copy this folder to ~/.config/opencode/plugins/context-bank/
//   OR add "opencode-context-bank" to your opencode config plugins array.

import type { Plugin } from "@opencode-ai/plugin"
import { retrieve } from "./retriever.js"
import { saveEntry } from "./store.js"
import { buildCompactionSummary } from "./builder.js"
import { compressOldEntries, getSessionSummary } from "./summarizer.js"
import { loadEntries } from "./store.js"

// Tools we skip — too noisy / low signal to store
const SKIP_STORE_TOOLS = new Set([
  "list_directory",
  "get_diagnostics",
])

// Tools we skip retrieving for — they don't benefit from context
const SKIP_RETRIEVE_TOOLS = new Set([
  "list_directory",
  "shell", // shell is too broad to retrieve against usefully
])

export const ContextBankPlugin: Plugin = async ({ directory }) => {
  const project = directory ?? process.cwd()

  // On startup: compress old entries
  const compressed = compressOldEntries(project)
  if (compressed > 0) {
    console.log(`[context-bank] Compressed ${compressed} old entries.`)
  }

  return {
    // ─── RETRIEVE ────────────────────────────────────────────────────────────
    // Before each tool call: pull relevant past context and inject it
    "tool.execute.before": async (input, output) => {
      if (SKIP_RETRIEVE_TOOLS.has(input.tool)) return

      // Build a query string from the tool name + args shape exposed by the hook.
      const queryParts = [
        input.tool,
        ...Object.values(output.args ?? {}).map(String),
      ]
      const query = queryParts.join(" ").slice(0, 300)

      // Newer OpenCode hook types no longer expose a context output here.
      // We still precompute retrieval to keep the signal path active.
      retrieve(query, project)
    },

    // ─── STORE ───────────────────────────────────────────────────────────────
    // After each tool call: save what happened
    "tool.execute.after": async (input, output) => {
      if (SKIP_STORE_TOOLS.has(input.tool)) return

      const result = output?.output ?? ""

      // Now async to support embedding generation
      await saveEntry({
        tool: input.tool,
        args: input.args ?? {},
        result,
        project,
      })
    },

    // ─── COMPACTION ──────────────────────────────────────────────────────────
    // When OpenCode is about to compress the context window:
    // inject our bank summary so it survives into the next window
    "experimental.session.compacting": async (_input, output) => {
      const entries = loadEntries(project)
      const summary = buildCompactionSummary(entries)
      const sessionInfo = getSessionSummary(project)

      output.context.push(`
## Context Bank (persisted memory)
${sessionInfo}

${summary}
      `.trim())
    },

    // ─── SESSION END ─────────────────────────────────────────────────────────
    // On idle/end: run a final compression pass
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        compressOldEntries(project)
      }
    },
  }
}

export default ContextBankPlugin
