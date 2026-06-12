---
name: ratel-mcp-cli
description: Explain and use the ratel-mcp CLI, including available commands, flags, common recipes, and when to run serve, mcp, backup, or ui commands.
---

# Ratel MCP CLI

Use this skill when the user asks how to use the `ratel-mcp` command, asks what commands or flags exist, wants examples, or needs a CLI recipe for configuring, running, inspecting, or debugging Ratel MCP.

## Command Map

Top-level commands:

- `ratel-mcp serve` starts the MCP gateway over stdio.
- `ratel-mcp mcp` manages upstream MCP server entries.
- `ratel-mcp backup` manages backup snapshots.
- `ratel-mcp ui` launches the local browser UI.
- `ratel-mcp --version` or `ratel-mcp version` prints the CLI version.
- `ratel-mcp help` prints top-level usage.

`ratel-mcp mcp` verbs:

- `add` adds an upstream MCP server entry.
- `remove` removes an upstream from a Ratel scope.
- `list` lists configured upstreams across Ratel scopes.
- `get` shows one entry's resolved details.
- `edit` edits fields on an existing entry; it is interactive when no edit flags are supplied.
- `import` migrates agent MCP configs into Ratel and can rewrite the agent to use the Ratel gateway.
- `link` rewrites an agent's config to point at Ratel for entries already in Ratel scopes.
- `auth` runs OAuth for HTTP/SSE upstreams or checks stored auth state.

## Scopes

Ratel config is layered from broad to narrow:

- `user`: `~/.ratel/config.json`
- `project`: `<project>/.ratel/config.json`
- `local`: `<project>/.ratel/config.local.json`

Prefer `--scope project` for team-shared project tools, `--scope local` for machine-specific tools or secrets, and `--scope user` for personal tools used across projects.

## Common Recipes

List configured upstreams:

```bash
ratel-mcp mcp list
```

Run the gateway from the current project:

```bash
ratel-mcp serve --auto-config
```

Run the local UI:

```bash
ratel-mcp ui
ratel-mcp ui --port 7331 --no-open
```

Add a stdio upstream:

```bash
ratel-mcp mcp add --scope project github -- npx -y @modelcontextprotocol/server-github
```

Add env vars to a stdio upstream:

```bash
ratel-mcp mcp add --scope local github --env GITHUB_TOKEN=... -- npx -y @modelcontextprotocol/server-github
```

Add an HTTP upstream:

```bash
ratel-mcp mcp add --scope project docs https://example.com/mcp --transport http
```

Add an SSE upstream:

```bash
ratel-mcp mcp add --scope project docs https://example.com/sse --transport sse
```

Add headers to an HTTP/SSE upstream:

```bash
ratel-mcp mcp add --scope local docs https://example.com/mcp --header "Authorization: Bearer ..."
```

Import Codex MCP servers into Ratel:

```bash
ratel-mcp mcp import --agent codex
```

Preview an import without writing:

```bash
ratel-mcp mcp import --agent codex --dry-run
```

Import non-interactively:

```bash
ratel-mcp mcp import --agent codex --yes --conflict-strategy add-missing-only
```

Link Codex to the Ratel gateway after entries already exist in Ratel:

```bash
ratel-mcp mcp link --agent codex
```

Authorize HTTP/SSE upstreams:

```bash
ratel-mcp mcp auth
ratel-mcp mcp auth <name>
ratel-mcp mcp auth --check
```

Inspect backups:

```bash
ratel-mcp backup list
```

## Agent Notes

- Agent-aware commands accept `--agent auto|claude-code|codex`; use `--agent codex` when the user is focused on Codex.
- `import` has two stages: write selected agent MCP entries into Ratel config, then optionally rewrite the agent config to use one Ratel gateway entry.
- `link` does only the rewrite stage for entries already represented in Ratel.
- `serve --auto-config` loads user, project, and local Ratel configs based on the current working directory and project root detection.
- For plugin installs, the bundled MCP server should remain a single Ratel gateway entry; upstream MCP definitions belong in Ratel config files.
