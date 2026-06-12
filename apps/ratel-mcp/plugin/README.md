# Ratel MCP Plugin

This plugin root is shared by Codex and Claude Code. It exposes the Ratel MCP gateway and bundles skills that explain how to configure, use, and debug the gateway.

## Layout

```text
.codex-plugin/plugin.json   # Codex plugin manifest
.claude-plugin/plugin.json  # Claude Code plugin manifest
.mcp.json                   # shared plugin MCP server definition
hooks.json                  # Codex plugin hook config
hooks/hooks.json            # Claude Code plugin hook config
skills/                     # shared Agent Skills
```

Claude Code marketplaces live at `.claude-plugin/marketplace.json`. The repo
root marketplace points at `./apps/ratel-mcp/plugin`, which works for both
local validation from the repo root and GitHub distribution.

Claude Code currently supports display names in plugin and marketplace metadata,
but its documented manifest schema does not include icon or logo fields. The
shared `assets/icon.svg` remains referenced by the Codex manifest.

The MCP server starts with:

```bash
npx -y @ratel-ai/mcp-server@0.3.0-rc.0 serve --auto-config
```

`--auto-config` loads `~/.ratel/config.json` plus project and local Ratel configs when a project root is discoverable.

## Hooks

The plugin includes simple logging hooks for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`. Codex reads the root `hooks.json`; Claude Code reads `hooks/hooks.json`. Both configs run `hooks/log-event.mjs`, read the hook event JSON from stdin, and append one JSON line per event to:

```text
$PLUGIN_DATA/hooks.jsonl
```

Claude Code uses `$CLAUDE_PLUGIN_DATA/hooks.jsonl`. If neither plugin data directory is provided, the logger falls back to the system temp directory. The hook does not print output or return decisions, so it is intended only as a minimal lifecycle smoke test.

## Codex Local Validation

Add the repo root as a local Codex marketplace root:

```bash
codex plugin marketplace add .
```

The repo root contains `.agents/plugins/marketplace.json`, which points Codex at
`./apps/ratel-mcp/plugin`. Then restart Codex, install **Ratel MCP** from the
**Ratel** marketplace, and start a new thread.

## Claude Code Local Validation

From the repo root:

```bash
claude plugin validate ./apps/ratel-mcp/plugin
claude plugin validate .
```

Add the local repo marketplace from inside Claude Code:

```bash
/plugin marketplace add .
/plugin install ratel-mcp@ratel
/reload-plugins
```

For GitHub distribution, publish the repo and add the root marketplace:

```bash
/plugin marketplace add ratel-ai/ratel-mcp
/plugin install ratel-mcp@ratel
/reload-plugins
```

## Configure Upstreams

Use the normal Ratel CLI:

```bash
ratel-mcp mcp add --scope user docs -- npx -y @upstash/context7-mcp
ratel-mcp mcp list
ratel-mcp mcp auth
```

Existing explicit config flows still work:

```bash
ratel-mcp serve --config ~/.ratel/config.json
```
