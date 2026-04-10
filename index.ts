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
//   OR add "@konuamah/context-bank" to your opencode config plugins array.

import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Part } from "@opencode-ai/sdk"
import { retrieve } from "./retriever.js"
import { saveEntry } from "./store.js"
import { buildContext, buildCompactionSummary } from "./builder.js"
import { compressOldEntries, getSessionSummary } from "./summarizer.js"
import { loadEntries } from "./store.js"
import { log } from "./logger.js"

const SKIP_STORE_TOOLS = new Set([
  "list_directory",
  "get_diagnostics",
])

const SKIP_RETRIEVE_TOOLS = new Set([
  "list_directory",
  "shell",
])

export const ContextBankPlugin: Plugin = async ({ directory }: PluginInput) => {
  const project = directory ?? process.cwd()
  log("Plugin initialized", { project })

  const compressed = compressOldEntries(project)
  if (compressed > 0) {
    log("Compressed old entries", { count: compressed })
  }

  return {
    "chat.message": async (input: any, output: any) => {
      log("chat.message hook fired", { sessionID: input.sessionID })

      try {
        const textParts = output.parts.filter(
          (p: Part): p is Part & { type: "text"; text: string } => p.type === "text"
        )

        if (textParts.length === 0) {
          log("chat.message: no text parts found")
          return
        }

        const userMessage = textParts.map((p: any) => p.text).join("\n")

        if (!userMessage.trim()) {
          log("chat.message: empty message, skipping")
          return
        }

        log("chat.message: processing", { messagePreview: userMessage.slice(0, 100) })

        const context = await retrieve(userMessage, project)
        
        if (context.entries.length === 0) {
          log("chat.message: no relevant entries found")
          return
        }

        const contextText = buildContext(context)

        const contextPart: Part = {
          id: `prt_context-bank-${Date.now()}`,
          sessionID: input.sessionID,
          messageID: output.message?.id,
          type: "text",
          text: contextText,
          synthetic: true,
        }

        output.parts.unshift(contextPart)
        log("chat.message: context injected", { entriesCount: context.entries.length })
      } catch (error) {
        log("chat.message: ERROR", { error: String(error) })
      }
    },

    "tool.execute.before": async (input: any, output: any) => {
      if (SKIP_RETRIEVE_TOOLS.has(input.tool)) return

      log("tool.execute.before", { tool: input.tool })

      const queryParts = [
        input.tool,
        ...Object.values(output.args ?? {}).map(String),
      ]
      const query = queryParts.join(" ").slice(0, 300)

      try {
        const context = await retrieve(query, project)
        if (context.entries.length > 0) {
          log("tool.execute.before: found relevant entries", { count: context.entries.length })
        }
      } catch (error) {
        log("tool.execute.before: retrieve error", { error: String(error) })
      }
    },

    "tool.execute.after": async (input: any, output: any) => {
      if (SKIP_STORE_TOOLS.has(input.tool)) return

      log("tool.execute.after", { tool: input.tool })

      const result = output?.output ?? ""

      try {
        await saveEntry({
          tool: input.tool,
          args: input.args ?? {},
          result,
          project,
        })
        log("tool.execute.after: entry saved", { tool: input.tool })
      } catch (error) {
        log("tool.execute.after: save error", { tool: input.tool, error: String(error) })
      }
    },

    "experimental.session.compacting": async (_input: any, output: any) => {
      log("session.compacting hook fired")

      try {
        const entries = loadEntries(project)
        const summary = buildCompactionSummary(entries)
        const sessionInfo = getSessionSummary(project)

        output.context.push(`
## Context Bank (persisted memory)
${sessionInfo}

${summary}
        `.trim())
        log("session.compacting: context injected", { entriesCount: entries.length })
      } catch (error) {
        log("session.compacting: ERROR", { error: String(error) })
      }
    },

    event: async (input: { event: { type: string; properties?: unknown } }) => {
      log("event hook", { type: input.event.type })

      if (input.event.type === "session.idle") {
        try {
          compressOldEntries(project)
          log("session.idle: compression complete")
        } catch (error) {
          log("session.idle: compression error", { error: String(error) })
        }
      }
    },
  }
}

export default ContextBankPlugin