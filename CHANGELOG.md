# Changelog

All notable changes to this project will be documented in this file.

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
