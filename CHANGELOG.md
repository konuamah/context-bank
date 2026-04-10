# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Preemptive Compaction**: Proactively triggers context compaction before limits are hit:
  - Monitors `message.updated` events for context usage (tokens field).
  - When usage exceeds `COMPACTION_THRESHOLD` (80%), injects memory context and triggers `session.summarize()`.
  - Shows toast notification: "Context compacted with memory context".
  - Saves session summaries as memory entries for future retrieval.
  - Uses `COMPACTION_COOLDOWN_MS` (30s) to prevent rapid re-compaction.
  - Model context limits retrieved from provider API via SDK.

## [0.1.0] - 2026-04-06

### Added
- **Initial Release**: Persistent context bank for OpenCode with semantic search.
- **Semantic Search**: In-process embeddings using `@xenova/transformers` with `all-MiniLM-L6-v2`.
- **Per-project storage**: JSON-based storage at `~/.config/opencode/context-bank/`.
- **Hooks**:
  - `tool.execute.before`: Intelligent context retrieval.
  - `tool.execute.after`: Semantic vector storage.
  - `experimental.session.compacting`: Context preservation during compaction.
  - `event: session.idle`: Memory cleanup and compression.
- **Documentation**: Comprehensive README, MIT license, and publishing metadata.
- **Setup**: `setup.ts` script for manual model pre-downloading.
