import fs from "fs";
import path from "path";
import { generateEmbedding } from "./dist/embeddings.js";

const storeDir = path.join(process.env.USERPROFILE || "", ".config", "opencode", "context-bank");
const filePath = path.join(storeDir, "D__projects_lms.json");

async function reindex() {
  console.log("--- LMS Memory Re-indexing ---");
  
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    return;
  }

  const entries = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log(`Found ${entries.length} entries. Generating embeddings...`);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.embedding) {
      // Create a text representation for the embedding
      const textToEmbed = `Tool: ${entry.tool}\nArgs: ${JSON.stringify(entry.args)}\nResult: ${entry.result}`;
      try {
        console.log(`[${i + 1}/${entries.length}] Generating for: ${entry.tool}...`);
        entry.embedding = await generateEmbedding(textToEmbed);
      } catch (err) {
        console.error(`Failed at entry ${i}:`, err);
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  console.log("\n✅ Re-indexing complete. LMS memory is now semantically searchable.");
}

reindex().catch(console.error);
