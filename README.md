# @konuamah/context-bank

A persistent context bank plugin for [OpenCode](https://opencode.ai) with **semantic search**. Automatically retrieves, stores, and compresses your coding session memory using in-process AI embeddings.

[![npm version](https://img.shields.io/npm/v/@konuamah/context-bank.svg)](https://www.npmjs.com/package/@konuamah/context-bank)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 What it does

This plugin solves the "goldfish memory" problem in LLM-based coding. It maintains a per-project memory bank that intelligently injects relevant past context into your current conversation.

- ✅ **Semantic Retrieval**: Finds conceptually related context using 384-dimensional embeddings.
- ✅ **No External Servers**: Powered by `@xenova/transformers` running entirely in-process.
- ✅ **Privacy First**: Your data stays local in `~/.config/opencode/context-bank/`.
- ✅ **Cross-Platform**: Fully compatible with macOS, Linux, and Windows.
- ✅ **Automatic Compaction**: Compresses old memory entries to save tokens while retaining core insights.

| Hook | Action |
|---|---|
| `tool.execute.before` | Retrieves relevant past context and injects it before each tool call |
| `tool.execute.after` | Stores tool results with semantic embeddings |
| `experimental.session.compacting` | Injects memory summary during session compaction |
| `event: session.idle` | Compresses old entries when the session ends |

---

## 📦 Installation

### 1. Install via npm
```bash
npm install @konuamah/context-bank
```

### 2. Add to OpenCode Config
Add the plugin to your global (`~/.config/opencode/opencode.json`) or project-level `opencode.json`. **Note: This step must be done manually after installation.**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@konuamah/context-bank"]
}
```

### 3. Restart OpenCode
**Important**: After adding the plugin to your config:

1. Exit OpenCode completely (close all sessions)
2. Start a new OpenCode session

**If the plugin doesn't load after restarting OpenCode, restart your machine.** This is especially important on macOS where cached processes may prevent the plugin from initializing.

To verify the plugin is working, check if the context bank directory exists:
```bash
ls ~/.config/opencode/context-bank/
```

### 4. (Optional) Pre-download AI Model
The model (~23 MB) downloads automatically on first use. To pre-download it manually:
```bash
npx @konuamah/context-bank-setup
```

---

## 🧠 Semantic Search

Unlike keyword-based search, this plugin understands the *meaning* of your actions:

| Your Query | Finds Related Context |
|------------|----------------------|
| "file operations" | read, write, delete, fs module, path manipulation |
| "error handling" | try/catch, validation, exceptions, failure cases |
| "authentication" | login, sessions, user management, auth tokens |
| "database query" | SQL, ORM, data fetching, db operations |

### Technical Details
- **Model**: `Xenova/all-MiniLM-L6-v2`
- **Embeddings**: 384-dimensional vectors
- **Storage**: JSON files per project at `~/.config/opencode/context-bank/<project>.json`
- **Performance**: <1ms retrieval for 300 entries.

---

## ⚙️ Configuration

The plugin uses sensible defaults but can be tuned by editing the constants in the source (or fork):

| Constant | Default | What it controls |
|---|---|---|
| `MAX_ENTRIES` | 300 | Max entries stored per project |
| `TOP_K` | 8 | Number of relevant entries retrieved per query |
| `TOKEN_CAP` | 1200 | Maximum tokens dedicated to injected context |
| `SUMMARIZE_AFTER_HOURS` | 24 | Age before an entry's result is compressed |

---

## 🛠️ Development

### Build from source
```bash
git clone https://github.com/konuamah/context-bank.git
cd context-bank
npm install
npm run build
```

### Run tests
```bash
npm run typecheck
```

---

## 📄 License

MIT © [Kelvin Owusu Nuamah](mailto:kelvinnuamah123@gmail.com)
