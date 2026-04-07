# Testing Context Bank Locally on macOS

## Setup

1. **Build the plugin locally:**
   ```bash
   cd /Users/slammtechnologies/Documents/GitHub/context-bank
   npm run build
   ```

2. **Create a test project:**
   ```bash
   mkdir ~/context-bank-test-project
   cd ~/context-bank-test-project
   ```

3. **Create a local OpenCode config:**
   ```bash
   mkdir .opencode
   cat > .opencode/opencode.json << 'EOF'
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": []
   }
   EOF
   ```

4. **Copy the plugin as a local plugin:**
   ```bash
   mkdir -p .opencode/plugins
   cp -r /Users/slammtechnologies/Documents/GitHub/context-bank/dist .opencode/plugins/context-bank
   cp /Users/slammtechnologies/Documents/GitHub/context-bank/node_modules -r .opencode/plugins/context-bank/
   ```

5. **Create a plugin loader:**
   ```bash
   cat > .opencode/plugins/load-context-bank.js << 'EOF'
   import { ContextBankPlugin } from './context-bank/index.js'
   export const LocalContextBank = ContextBankPlugin
   EOF
   ```

6. **Start OpenCode and test:**
   ```bash
   opencode
   ```

## Verify

```bash
# Check if context bank directory was created
ls ~/.config/opencode/context-bank/

# Check if entries are being saved
cat ~/.config/opencode/context-bank/*.json
```

## Clean Up

```bash
rm -rf ~/context-bank-test-project
```
