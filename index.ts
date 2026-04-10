// src/index.ts
//
// OpenCode Context Bank Plugin
// ============================
// Hooks into tool execution to automatically:
//   1. Retrieve relevant past context before each tool call
//   2. Store tool results after each tool call
//   3. Inject compressed memory during session compaction
//   4. Detect memory keywords and prompt AI to save important info
//
// Installation:
//   Copy this folder to ~/.config/opencode/plugins/context-bank/
//   OR add "@konuamah/context-bank" to your opencode config plugins array.

import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Part } from "@opencode-ai/sdk"
import { tool } from "@opencode-ai/plugin"
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

const KEYWORD_PATTERNS = [
  "remember that",
  "save this",
  "don't forget",
  "keep in mind",
  "note that",
  "write this down",
  "take note",
  "note to self",
  "remind me",
  "make a note",
]

const MEMORY_KEYWORD_PATTERN = new RegExp(
  "\\b(" + KEYWORD_PATTERNS.join("|") + ")\\b",
  "i"
)

const MEMORY_NUDGE_MESSAGE = `[MEMORY TRIGGER DETECTED]
The user wants you to remember something. You MUST use the context-bank tool with mode: "add" to save this information.

Extract the key information the user wants remembered and save it as a concise, searchable memory.
- Use scope: "project" for project-specific things (e.g., "run tests with bun test")
- Use scope: "user" for cross-project preferences (e.g., "prefers concise responses")
- The content field should contain the actual thing to remember.

DO NOT skip this step. The user explicitly asked you to remember.`

const COMPACTION_THRESHOLD = 0.80
const MIN_TOKENS_FOR_COMPACTION = 50000
const COMPACTION_COOLDOWN_MS = 30000
const DEFAULT_CONTEXT_LIMIT = 200000

interface CompactionState {
  lastCompactionTime: Map<string, number>
  compactionInProgress: Set<string>
  summarizedSessions: Set<string>
}

async function getModelLimit(providerID: string, modelID: string, client: any): Promise<number> {
  try {
    const { providers } = await client.config.providers()
    const provider = providers.find((p: any) => p.id === providerID)
    if (provider) {
      const model = provider.models?.find((m: any) => m.id === modelID)
      if (model?.contextLimit) return model.contextLimit
    }
  } catch {
    // ignore
  }
  return DEFAULT_CONTEXT_LIMIT
}

function calculateUsageRatio(tokens: number, contextLimit: number): number {
  return tokens / contextLimit
}

function detectMemoryKeyword(text: string): boolean {
  return MEMORY_KEYWORD_PATTERN.test(text)
}

export const ContextBankPlugin: Plugin = async (input: PluginInput) => {
  const project = input.directory ?? process.cwd()
  const pluginClient = input.client
  log("Plugin initialized", { project })

  const compressed = compressOldEntries(project)
  if (compressed > 0) {
    log("Compressed old entries", { count: compressed })
  }

  const compactionState: CompactionState = {
    lastCompactionTime: new Map(),
    compactionInProgress: new Set(),
    summarizedSessions: new Set(),
  }

  async function injectCompactionContext(sessionID: string, providerID: string, modelID: string): Promise<void> {
    if (!pluginClient) return

    const entries = loadEntries(project)
    const memoryContext = buildCompactionSummary(entries)

    try {
      await pluginClient.session.prompt({
        path: { id: sessionID },
        body: {
          noReply: true,
          parts: [{
            type: "text",
            text: `## Context Bank Memory (for compaction)\n\n${memoryContext}`,
          }],
        },
      })
      log("injectCompactionContext: memory context injected", { entriesCount: entries.length })
    } catch (error) {
      log("injectCompactionContext: ERROR", { error: String(error) })
    }
  }

  async function triggerSummarize(sessionID: string, providerID: string, modelID: string): Promise<void> {
    if (!pluginClient) return

    try {
      await pluginClient.session.summarize({
        path: { id: sessionID },
        body: { providerID, modelID },
      })
      log("triggerSummarize: summarize triggered", { sessionID })

      await pluginClient.tui.showToast({
        body: {
          message: "Context compacted with memory context",
          variant: "success",
        },
      })
    } catch (error) {
      log("triggerSummarize: ERROR", { error: String(error) })
    }
  }

  async function checkAndTriggerCompaction(
    sessionID: string,
    providerID: string,
    modelID: string,
    tokens: number
  ): Promise<void> {
    if (!pluginClient) return
    if (compactionState.compactionInProgress.has(sessionID)) return

    const now = Date.now()
    const lastTime = compactionState.lastCompactionTime.get(sessionID) ?? 0
    if (now - lastTime < COMPACTION_COOLDOWN_MS) return

    if (tokens < MIN_TOKENS_FOR_COMPACTION) return

    const contextLimit = await getModelLimit(providerID, modelID, pluginClient)
    const usageRatio = calculateUsageRatio(tokens, contextLimit)

    if (usageRatio < COMPACTION_THRESHOLD) return

    log("checkAndTriggerCompaction: threshold reached", { usageRatio, tokens, contextLimit })

    compactionState.compactionInProgress.add(sessionID)
    compactionState.lastCompactionTime.set(sessionID, now)

    try {
      await injectCompactionContext(sessionID, providerID, modelID)
      await triggerSummarize(sessionID, providerID, modelID)
    } finally {
      compactionState.compactionInProgress.delete(sessionID)
    }
  }

  return {
    chat: {
      message: async (input: any, output: any) => {
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

          if (detectMemoryKeyword(userMessage)) {
            log("chat.message: memory keyword detected")
            const nudgePart: Part = {
              id: `prt_context-bank-nudge-${Date.now()}`,
              sessionID: input.sessionID,
              messageID: output.message?.id,
              type: "text",
              text: MEMORY_NUDGE_MESSAGE,
              synthetic: true,
            }
            output.parts.push(nudgePart)
          }

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

    tool: {
      "context-bank": tool({
        description: "Manage your persistent memory. Use 'add' to save something important, 'list' to see recent memories, 'search' to find specific memories, and 'forget' to delete a memory.",
        args: {
          mode: tool.schema.enum(["add", "list", "search", "forget", "help"]).optional(),
          content: tool.schema.string().optional(),
          scope: tool.schema.enum(["user", "project"]).optional(),
          query: tool.schema.string().optional(),
          memoryId: tool.schema.string().optional(),
          limit: tool.schema.number().optional(),
        },
        async execute(args: {
          mode?: string
          content?: string
          scope?: "user" | "project"
          query?: string
          memoryId?: string
          limit?: number
        }) {
          const mode = args.mode || "help"

          try {
            switch (mode) {
              case "help":
                return JSON.stringify({
                  success: true,
                  message: "Context Bank Memory Tool",
                  commands: [
                    { command: "add", description: "Save a memory", args: ["content", "scope?"] },
                    { command: "list", description: "List recent memories", args: ["scope?", "limit?"] },
                    { command: "search", description: "Search memories", args: ["query", "scope?"] },
                    { command: "forget", description: "Delete a memory", args: ["memoryId"] },
                  ],
                  scopes: {
                    user: "Cross-project memories (apply everywhere)",
                    project: "Project-specific memories (default)",
                  },
                })

              case "add": {
                if (!args.content) {
                  return JSON.stringify({
                    success: false,
                    error: "content parameter is required for add mode",
                  })
                }

                const scope = args.scope || "project"
                log("context-bank: add", { scope, contentLength: args.content.length })

                await saveEntry({
                  tool: "context-bank-memory",
                  args: { mode, scope },
                  result: args.content,
                  project: scope === "user" ? "__user__" : project,
                })

                return JSON.stringify({
                  success: true,
                  message: "Memory added to " + scope + " scope",
                  content: args.content,
                  scope,
                })
              }

              case "list": {
                const scope = args.scope || "project"
                const limit = args.limit || 20
                const targetProject = scope === "user" ? "__user__" : project

                log("context-bank: list", { scope, limit })

                const entries = loadEntries(targetProject)
                const recent = entries.slice(-limit).reverse()

                return JSON.stringify({
                  success: true,
                  scope,
                  count: recent.length,
                  entries: recent.map((e) => ({
                    id: e.id,
                    tool: e.tool,
                    content: e.result,
                    timestamp: new Date(e.timestamp).toISOString(),
                  })),
                })
              }

              case "search": {
                if (!args.query) {
                  return JSON.stringify({
                    success: false,
                    error: "query parameter is required for search mode",
                  })
                }

                const context = await retrieve(args.query, project)

                return JSON.stringify({
                  success: true,
                  query: args.query,
                  count: context.entries.length,
                  results: context.entries.map((e) => ({
                    id: e.id,
                    tool: e.tool,
                    content: e.result,
                    timestamp: new Date(e.timestamp).toISOString(),
                  })),
                })
              }

              case "forget": {
                if (!args.memoryId) {
                  return JSON.stringify({
                    success: false,
                    error: "memoryId parameter is required for forget mode",
                  })
                }

                const scope = args.scope || "project"
                const targetProject = scope === "user" ? "__user__" : project
                const entries = loadEntries(targetProject)
                const filtered = entries.filter((e) => e.id !== args.memoryId)

                if (filtered.length === entries.length) {
                  return JSON.stringify({
                    success: false,
                    error: "Memory not found",
                  })
                }

                const { replaceEntries } = await import("./store.js")
                replaceEntries(targetProject, filtered)

                log("context-bank: forget", { memoryId: args.memoryId, scope })

                return JSON.stringify({
                  success: true,
                  message: "Memory " + args.memoryId + " deleted from " + scope + " scope",
                })
              }

              default:
                return JSON.stringify({
                  success: false,
                  error: "Unknown mode: " + mode,
                })
            }
          } catch (error) {
            log("context-bank tool: ERROR", { error: String(error) })
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
      }),
    },

    "experimental.session.compacting": async (_input: any, output: any) => {
      log("session.compacting hook fired")

      try {
        const entries = loadEntries(project)
        const summary = buildCompactionSummary(entries)
        const sessionInfo = getSessionSummary(project)

        output.context.push(
          "## Context Bank (persisted memory)\n" +
          sessionInfo + "\n\n" +
          summary
        )
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

      if (input.event.type === "message.updated") {
        const props = input.event.properties as any
        const info = props?.info

        if (info?.role === "assistant" && info?.tokens?.total) {
          const sessionID = info.sessionID ?? props.sessionID
          const providerID = info.providerID
          const modelID = info.modelID
          const tokens = info.tokens.total

          if (sessionID && providerID && modelID) {
            await checkAndTriggerCompaction(sessionID, providerID, modelID, tokens)
          }
        }

        if (info?.role === "assistant" && info?.summary === true && info?.content) {
          try {
            await saveEntry({
              tool: "session-summary",
              args: {},
              result: props.content,
              project,
            })
            log("event: summary saved", { sessionID: props.sessionID })
          } catch (error) {
            log("event: summary save error", { error: String(error) })
          }
        }
      }
    },
  }
}

export default ContextBankPlugin