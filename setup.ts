// setup.ts
//
// Pre-download script for context-bank embeddings model.
// This ensures the 23MB model is available before the plugin first runs.

import { pipeline, env } from "@xenova/transformers"
import { resolve } from "path"

// Replicate cache logic from embeddings.ts
const CACHE_DIR = resolve(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".config/opencode/context-bank/models"
)

env.localModelPath = CACHE_DIR
env.cacheDir = CACHE_DIR

const MODEL = "Xenova/all-MiniLM-L6-v2"

async function setup() {
  console.log("--- Context Bank: Model Setup ---")
  console.log(`Target cache: ${CACHE_DIR}`)
  console.log(`Model: ${MODEL}`)
  console.log("\nDownloading model weights (~23 MB). This may take a moment...")

  try {
    // Pipeline initialization triggers the download
    await pipeline("feature-extraction", MODEL)
    console.log("\n✅ Success! Model is downloaded and cached.")
    console.log("The plugin will now start instantly in your next session.")
  } catch (error) {
    console.error("\n❌ Failed to download model:", error)
    process.exit(1)
  }
}

setup()
