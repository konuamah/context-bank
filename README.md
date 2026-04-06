# opencode-context-bank

A persistent context bank plugin for [OpenCode](https://opencode.ai) with **semantic search**. Automatically retrieves, stores, and compresses your coding session memory using in-process AI embeddings.

---

## What it does

| Hook | Action |
|---|---|
| `tool.execute.before` | Retrieves relevant past context and injects it before each tool call |
| `tool.execute.after` | Stores tool results after each tool call |
| `experimental.session.compacting` | Injects compressed memory summary before context window compaction |
| `event: session.idle` | Compresses old entries on session end |

---

## Installation

### Option A — Local plugin (recommended for development)

```bash
# 1. Download dependencies + AI model weights (~23 MB)
npm install
npm run setup

# 2. Copy to OpenCode's plugin directory
cp -r . ~/.config/opencode/plugins/context-bank/
```

OpenCode auto-loads all files in `~/.config/opencode/plugins/` at startup.

### Option B — npm package

```bash
# Add to your opencode config
```

```json
// ~/.config/opencode/config.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-context-bank"]
}
```

---

## Project structure

```
index.ts        ← Plugin entry point (hooks)
embeddings.ts   ← In-process semantic embeddings using transformers.js
store.ts        ← Read/write JSON store with embeddings per project
retriever.ts    ← Semantic search with keyword fallback
builder.ts      ← Formats retrieved context for injection
summarizer.ts   ← Compresses old entries to save tokens
```

---

## How context is stored

Each project gets its own JSON file at:

```
~/.config/opencode/context-bank/<project_name>.json
```

Each entry includes a **384-dimensional semantic embedding** generated using `@xenova/transformers` for intelligent context retrieval.

Entries are capped at **300 per project**. Entries older than **24 hours** get their results compressed to 150 chars.

---

## Semantic Search

The plugin uses **in-process embeddings** powered by `@xenova/transformers` (Xenova/all-MiniLM-L6-v2 model):

- **No external servers required** - everything runs locally in Node.js
- **First-time setup**: Model downloads automatically (~23 MB) to `~/.config/opencode/context-bank/models/`
- **Subsequent runs**: Model loads from cache instantly
- **Smart retrieval**: Finds conceptually related context, not just keyword matches

### Examples of Semantic Understanding:

| Your Query | Finds Related Context |
|------------|----------------------|
| "file operations" | read, write, delete, move, copy, fs module |
| "error handling" | try/catch, validation, exceptions, failure cases |
| "authentication" | login, sessions, user management, auth tokens |
| "database query" | SQL, ORM, data fetching, db operations |

### Backward Compatibility:

Old entries without embeddings automatically fall back to keyword matching. New entries get embeddings automatically - no migration needed.

---

## Build and package

```bash
# Type-check
npm test

# Build distributable files into dist/
npm run build

# Create a publishable tarball (runs build automatically)
npm pack
```

---

## Tuning

| Constant | File | Default | What it controls |
|---|---|---|---|
| `MAX_ENTRIES` | store.ts | 300 | Max entries per project |
| `TOP_K` | retriever.ts | 8 | Entries retrieved per query |
| `TOKEN_CAP` | retriever.ts | 1200 | Token budget for injected context |
| `SUMMARIZE_AFTER_HOURS` | summarizer.ts | 24 | Age before compression |
| `SKIP_STORE_TOOLS` | index.ts | list_directory, get_diagnostics | Tools not worth storing |

---

## Architecture

```
Tool call
   │
   ├── tool.execute.before
   │     retriever.ts  ← semantic search with embeddings
   │     builder.ts    ← filters + formats for injection
   │     → injected into LLM context
   │
   └── tool.execute.after
         embeddings.ts ← generates 384-dim vector
         store.ts      ← saves result + embedding to JSON
         
Session compacting
   └── summarizer.ts   ← compresses + injects summary
```

---

## Bundle Size

| Component | Size | When Downloaded |
|-----------|------|----------------|
| `@xenova/transformers` | ~45 MB | npm install |
| `all-MiniLM-L6-v2` model | ~23 MB | First use (cached) |
| **Total** | **~68 MB** | One-time download |

Model is cached at `~/.config/opencode/context-bank/models/` and reused across all projects.
