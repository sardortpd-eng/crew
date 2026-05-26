# crew

A terminal UI for orchestrating **multiple Claude agents at once** — running on your
Claude **subscription**, not metered API credits.

crew drives the official [`@anthropic-ai/claude-agent-sdk`][sdk], which spawns the same
logged-in `claude` binary you already use. As long as `ANTHROPIC_API_KEY` is **not** set,
the SDK falls back to the CLI's subscription OAuth, so every run bills to your plan. crew
strips the key per-query defensively and warns at startup if it finds one.

## Requirements

- [Bun](https://bun.sh) (runtime, bundler, test runner)
- The `claude` CLI, logged into your subscription (`claude` → `/login`)

## Install

```bash
bun install
bun link        # makes `crew` available on your PATH
```

Then run `crew` in any project directory. Or run it locally without linking:

```bash
bun start
```

## Usage

crew runs full-screen with a header bar (subscription badge + live cost/token totals), a
body that switches between two views, and an input bar.

### Just type — crew picks the agent

You don't have to choose an agent. Type a normal prompt and crew **auto-assigns** the
best-fit preset, then hands it the work:

```text
review the auth module        → reviewer
write tests for the router     → tester
the grid flickers, fix it      → debugger
add a dark-mode toggle         → coder
```

- **Smart default:** with no agent focused, a plain prompt is routed; once you're focused on
  an agent, plain text continues that conversation (so follow-ups aren't hijacked). Use
  `/route <prompt>` to force a fresh assignment anytime.
- **Hybrid classifier:** a keyword fast-path handles obvious prompts instantly and for free;
  anything ambiguous falls back to a cheap model call (which picks from preset descriptions,
  so your **custom presets** are eligible too). Unknown/failed → `coder`.
- **Reuse, else spawn:** routes to an existing agent of that preset (continuing its context)
  or spawns a new one, which becomes focused. A `↳ reviewer · …` line shows the choice.

### Views

- **Focus view** — a single Claude-Code-style transcript column for the focused agent.
- **Grid view** — every agent tiled in its own bordered pane, each streaming live with a
  header (status, model, cost/tokens). The focused pane is outlined in the accent color.

crew opens in focus view for one agent and **auto-promotes to grid at 2+ agents**.
`Ctrl+G` or `/view [grid|focus]` toggles manually (and locks your choice).

In grid view the prompt starts in **nav mode** so the keyboard drives the panes:

| Key | Action |
|-----|--------|
| `1`–`9` | Focus pane N |
| `Tab` / `Shift+Tab` / arrows | Move focus between panes |
| `PgUp` / `PgDn` | Scroll the focused pane's history (`0` jumps back to live) |
| `i` or `/` | Start typing in the prompt |
| `Esc` | Leave typing (or interrupt a running agent) |

### Commands

Type `/` to open an **autocomplete menu** — it filters as you type (`/mo` → `/mode`, `/model`),
shows what each command does, and once you pick one it shows its argument hint (`/mode ` →
`[normal|plan|auto-edit|bypass]`). Use **↑/↓** to select, **Tab** (or Enter on a partial) to fill it in.

| Command | What it does |
|---------|--------------|
| `/spawn <preset> [task]` | Launch an agent; optionally give it a task immediately |
| `/broadcast <task>` | Send the same task to **every** agent in parallel |
| `/focus <id\|number>` | Switch the focused agent |
| `/view [grid\|focus]` | Switch layout (also `Ctrl+G`) |
| `/mode [normal\|plan\|auto-edit\|bypass]` | Set the safety mode (Shift+Tab cycles) |
| `/model [opus\|sonnet\|haiku\|default]` | Override the model for every agent (`default` = per-preset) |
| `/checkpoint [label]` | Commit a git checkpoint of the working tree now |
| `/undo` | Roll back the last checkpoint |
| `/diff` | Show the latest checkpoint's changed files |
| `/budget [usd\|off]` | Cap per-turn spend (e.g. `/budget 0.50`) |
| `/budget total <usd\|off>` | Cap total session spend (pauses `/run` when crossed) |
| `/plan <goal>` | Break a goal into an assigned task board |
| `/run` | Run the task board sequentially |
| `/tasks` | Show the task board |
| `/save` | Save this crew session to disk |
| `/forget` | Clear the saved session for this folder |
| `/audit` | Show the recent audit trail |
| `/ship` | Run the configured deploy + health-check gate |
| `/worktrees [on\|off\|list\|clean]` | Isolate each builder in its own git worktree |
| `/verify [id\|on\|off]` | Run quality gates now, or toggle auto-verify |
| `/route <prompt>` | Force crew to auto-assign the best agent for a prompt |
| `/install <repo> [--global]` | Install skills/commands/MCP from a git repo (see below) |
| `/install list` | List installed plugins + their components |
| `/uninstall <name>` | Remove an installed plugin |
| `/stop [id]` | Abort the focused agent's turn (or one by id) |
| `/remove [id]` | Stop and remove an agent |
| `/preset` | List available presets |
| `/preset new …` | Create a custom preset (see below) |
| `/preset rm <name>` | Remove a custom preset |
| `/preset reload` | Reload presets from config files |
| `/help` | Show commands |
| `/quit` | Exit (also `Ctrl+C`) |
| `<text>` | Message the focused agent (resumes its session) |

### Built-in presets

| Preset | Model | Tools | Mode |
|--------|-------|-------|------|
| `coder` | sonnet | Read, Edit, Write, Bash, Grep, Glob | acceptEdits |
| `reviewer` | sonnet | Read, Grep, Glob | default (read-only) |
| `explorer` | haiku | Read, Grep, Glob | default (read-only) |
| `planner` | opus | Read, Grep, Glob | plan |
| `tester` | sonnet | Read, Edit, Write, Bash, Grep, Glob | acceptEdits |
| `debugger` | sonnet | Read, Edit, Bash, Grep, Glob | acceptEdits |
| `docs` | sonnet | Read, Edit, Write, Grep, Glob | acceptEdits |
| `security` | opus | Read, Grep, Glob | default (read-only) |
| `refactorer` | sonnet | Read, Edit, Write, Grep, Glob | acceptEdits |
| `architect` | opus | Read, Grep, Glob | plan |

### Custom presets

Create one from the input bar — `<tools>` is comma-separated, the rest is the system prompt:

```text
/preset new <name> <model> <mode> <tool,tool,…> <system prompt…>
/preset new sql-pro opus default Read,Grep,Glob You optimize SQL read-only and propose indexes.
```

- `<model>`: `opus` · `sonnet` · `haiku`
- `<mode>`: `default` · `acceptEdits` · `plan` · `bypassPermissions` · `delegate` · `dontAsk`

Custom presets are validated (Zod) and saved to `~/.config/crew/presets.json`, so they
persist across sessions and show up in `/spawn`. You can also hand-author presets there
(or in a project-local `.crew/presets.json`, which wins on name conflicts) as a JSON array:

```json
[
  {
    "name": "sql-pro",
    "description": "SQL optimization expert",
    "model": "opus",
    "systemPrompt": "You optimize SQL read-only and propose indexes.",
    "allowedTools": ["Read", "Grep", "Glob"],
    "permissionMode": "default"
  }
]
```

Run `/preset reload` after editing the file. Built-in names can't be shadowed or removed.

### Example

```text
/spawn explorer map the engine module
/spawn reviewer
/broadcast what are the biggest risks in src/engine?
/focus 2
follow-up question for the reviewer...
```

Each agent is an independent SDK session, so they stream concurrently. Following up on a
focused agent resumes its session, so it remembers context.

### Worktree isolation (opt-in)

By default all agents share the working directory, so the task runner is sequential and broadcasting
to multiple builders isn't safe. Turn on **`/worktrees on`** and each builder agent works in its own
git worktree (`.crew/worktrees/<agentId>` on branch `crew/wt-<agentId>`):

- Concurrent `/broadcast` and chatting with multiple builders become safe — they can't clobber each
  other, and the **main working tree stays untouched**.
- Each agent's commit-on-green checkpoints + `/undo` operate on *its own* branch; `/worktrees list`
  shows them. Merge an agent's work with `git merge crew/wt-<agentId>`.
- `/remove` cleans up an agent's worktree (branch kept); `/worktrees clean` removes all. Leftovers are
  gitignored and `git worktree prune`-able.
- Off by default; read-only agents always use the main tree. (`/run` stays sequential for now —
  parallel execution is a follow-on.)

### Ship & observe

- **Audit trail** — every meaningful action (agent spawn/remove, message, tool call, permission
  allow/deny, verify result, checkpoint, mode/budget change, ship) is appended to
  `.crew/audit.jsonl` (gitignored) with a timestamp + agent id. `/audit` shows the recent tail —
  an accountable record of what the AI did.
- **`/ship`** — runs a final deploy gate you configure in `.crew/verify.json`, manually (never
  automatic, since it's outward-facing):
  ```json
  { "deploy": "vercel deploy --prod", "health": "curl -fsS https://app.example.com/health" }
  ```
  It runs `deploy`, then (if set) `health`, reporting `✓ shipped` / `✗ …` and logging it.

### Sessions (resume across restarts)

crew remembers each project. When you launch it in a folder where you've worked before, it
**restores the crew** — every agent (resuming its prior conversation via `query({resume})`) and
the task board — so you can pick up a build across multiple sittings.

- Autosaves to `.crew/session.json` (gitignored) as you work; `/save` forces a save now.
- On launch you'll see `Restored N agent(s) + M task(s)` — message an agent to continue where it
  left off (its context is resumed, though the on-screen transcript starts fresh).
- `/forget` clears the saved session for the current folder.

### Plan → task board → run

Hand crew a high-level goal and it plans the work:

```text
/plan build a CLI todo app with add/list/done commands and tests
```

- A planner LLM decomposes the goal into an **ordered task board**, each task assigned to the
  best preset. On an empty/greenfield repo it skips a pointless "explore the codebase" step.
  `/tasks` shows the board.
- **`/run`** executes the board **one task at a time** — routing each to (or reusing) its preset,
  waiting for the turn *and* its verify to settle, marking `✓`/`✗`. A task that **fails verify
  pauses the run** (so broken state doesn't cascade); fix it and `/run` resumes the rest. Each
  green task is auto-checkpointed. Sequential on purpose (shared working dir; `/worktrees on`
  isolates builders, parallel run is a follow-on).
- `/stop` halts the runner after the current task; `/budget total <usd>` stops it once cumulative
  spend crosses the cap.

### Verify + auto-fix

When a **builder** agent (one that edits code — `coder`, `tester`, `debugger`, `docs`,
`refactorer`) finishes a turn, crew runs the project's quality gates and, on the first
failure, hands the error back to that agent to fix — repeating until green or it gives up.

- **Auto-detected** from the repo: typecheck → lint → test → build, in that order (cheap
  first, fail-fast). Package manager is inferred from the lockfile. Override per project
  with `.crew/verify.json`:
  ```json
  { "autoVerify": true, "maxAttempts": 3,
    "gates": [{ "name": "test", "command": "bun test" }] }
  ```
- **Bounded:** stops after `maxAttempts` (default 3) so it can't loop or burn budget.
- **Scoped:** read-only agents (reviewer, explorer, planner, security) never trigger it.
- **Serialized:** one verify runs at a time (agents share a working directory).
- Status shows inline — `⟳ verifying` / `✓ verified` / `✗ failing` — in the focus view and
  as a glyph in each grid pane header. `/verify` runs it manually; `/verify off` disables auto.

### Safety modes

A session-wide safety level (like Claude Code's permission modes) overrides every
agent's preset. Cycle it with **Shift+Tab**, or set it with `/mode`. The current mode
shows in the header bar.

| Mode | Behavior |
|------|----------|
| `normal` | Each agent uses its own preset's mode (the default) |
| `plan` | Read-only everywhere — agents can read and plan, but not edit or run commands |
| `auto-edit` | Every agent auto-accepts edits (`acceptEdits`) |
| `bypass` ⚠ | Skip all approval prompts (`bypassPermissions`) — fast and dangerous |

`/mode` cycles; `/mode plan` · `/mode auto-edit` · `/mode bypass` · `/mode normal` set directly.

### Checkpoints (git-backed)

So autonomous edits are reversible, crew checkpoints your work with git:

- On the **first** checkpoint, crew creates and switches to a `crew/<timestamp>` branch — your
  working/main branch is never touched. Merge it yourself when you're happy.
- **Commit-on-green:** after a builder agent's turn passes verify, crew commits the working tree
  as a checkpoint (`crew(coder-1): <task>`). `/checkpoint [label]` snapshots manually anytime.
- **`/undo`** hard-resets the tree to the previous checkpoint (then the branch base); **`/diff`**
  shows the latest checkpoint's changed files. The header shows `⎇ crew/… · N ckpt`.
- Needs a git repo in the working directory; outside one, checkpoints are silently off. Note: a
  checkpoint commits *all* current changes in the tree (it's a snapshot), which is why it lives on
  its own branch.

### Permissions

Tools outside a preset's allowlist trigger an inline **allow / deny** prompt
(`[y]`/`[n]`). Unanswered prompts auto-deny after 60s, so a forgotten approval never
blocks an agent. The safety mode above can override this for the whole session.

### Guardrails & budgets

Two always-on safety nets independent of the permission mode:

- **Command guardrail** — a `PreToolUse` hook blocks genuinely destructive shell (`rm -rf /`,
  fork bombs, `mkfs`, `dd` to a disk, `git push --force`, `curl … | sh`, …) *even in `bypass`
  mode*, where the normal prompt is skipped. The denylist is deliberately tight to avoid blocking
  real work (`rm -rf node_modules` is fine).
- **Budget cap** — `/budget 0.50` caps each turn's spend (SDK `maxBudgetUsd`); a turn that hits the
  cap stops with "budget cap reached". `/budget off` clears it. Shown in the header as `$0.50/turn`.

### MCP servers & external tools

Give agents extra tools — browser automation, a database, deploys, GitHub — by connecting
MCP servers. Drop a `.crew/mcp.json` in your project (or `~/.config/crew/mcp.json` for all
projects); project entries win on name conflicts. See `.crew/mcp.example.json`.

```json
{
  "settingSources": ["project"],
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "db":         { "type": "http", "url": "https://mcp.example.com/" }
  }
}
```

- **`mcpServers`** — stdio (`command`/`args`/`env`) or remote (`type: "http"|"sse"`, `url`,
  `headers`). Connected for every agent; an agent uses a server's tools as `mcp__<server>__<tool>`,
  which hit the **allow/deny** prompt unless allowlisted (so MCP calls are gated by default).
- **`settingSources`** — which filesystem settings to load: `"project"` (default) pulls in your
  project `CLAUDE.md` + `.claude/settings.json`; add `"user"` to also inherit your global Claude
  Code config (and the MCP servers you've already set up there). Config is passed verbatim — no
  env-var interpolation, so put real values (or keep secrets in a user-scoped file).
- **`/mcp`** lists configured servers and their live connection status (read from each session's
  init message: `connected` / `failed` / `needs-auth` / `pending`).

### Install from a git repo

Pull skills, slash commands, subagents, hooks, and MCP servers straight from a repo:

```
/install anthropics/some-skill-pack        # GitHub owner/repo → project (.crew/installed/)
/install https://gitlab.com/g/plugin.git   # any git URL
/install owner/repo#v2 --global            # a ref, installed for every project (~/.config/crew/)
/install list                              # what's installed + each one's components
/uninstall some-skill-pack
```

Crew shallow-clones the repo and registers it as a **local plugin** — the SDK's plugin format is a
superset, so one install covers `commands/`, `skills/<name>/SKILL.md`, `agents/`, `hooks/`, and
`.mcp.json`. A repo that ships without a `.claude-plugin/plugin.json` gets a minimal one synthesized
so it still loads. Because each turn rebuilds the agent's options, an install goes **live on the
next message to any agent** — no respawn. Scope is project by default, `--global` for all projects;
both are tracked in an `installed.json` registry crew loads at startup.

> Cloning runs no repo code, but a plugin's hooks/MCP **do** run when an agent uses them — the same
> guardrail hook still blocks destructive shell. Only install repos you trust; crew echoes the source
> before fetching.

## Architecture

```
src/
├── cli.tsx                  # bin entry: API-key guard, alt-screen crash-restore, <App/>
├── engine/
│   ├── agentSession.ts      # wraps one SDK query() into an event emitter
│   ├── orchestrator.ts      # owns N AgentSessions: spawn/send/broadcast/stop
│   ├── presets.ts           # preset registry: built-ins + custom, Zod-validated
│   ├── router.ts            # prompt → best preset (heuristic + LLM fallback)
│   ├── verifier.ts          # runs one quality gate (injectable spawn)
│   ├── verifyController.ts  # verify + auto-fix loop (serialized queue)
│   ├── git.ts               # git ops via an injectable runner
│   ├── checkpointController.ts # commit-on-green checkpoints + /undo
│   ├── worktrees.ts         # per-agent git worktrees (opt-in isolation)
│   ├── guardrailHook.ts     # PreToolUse hook blocking destructive shell
│   ├── planner.ts           # decompose a goal into assigned tasks (LLM)
│   ├── env.ts               # subscriptionEnv (strips ANTHROPIC_API_KEY)
│   ├── types.ts             # shared engine types
│   └── mockQuery.ts         # injectable mock generator for tests
├── state/store.ts           # Zustand: agents, messages, focus, view, stats, scroll, verify
├── lib/
│   ├── commands.ts          # pure slash-command parser
│   ├── permissions.ts       # canUseTool factory (allowlist + timeout deny)
│   ├── presetStore.ts       # load/persist custom presets (config files)
│   ├── presetCommands.ts    # /preset list/new/rm/reload handlers
│   ├── projectGates.ts      # detect quality gates from the repo (+ .crew/verify.json)
│   ├── verifyDecision.ts    # pure: next action (pass/fix/giveup) + fix prompt
│   ├── routeHeuristics.ts   # pure keyword classifier for prompt routing
│   ├── guardrails.ts        # pure destructive-command denylist
│   ├── repoState.ts         # pure: is the repo greenfield? (planner hint)
│   ├── installSource.ts     # pure: parse /install arg → clonable source
│   ├── pluginLayout.ts      # pure: classify a cloned dir + synthesize a manifest
│   ├── installStore.ts      # clone/register/list/remove plugins (injectable git)
│   ├── sessionStore.ts      # save/restore crew + board (.crew/session.json)
│   ├── auditLog.ts          # append-only audit trail (.crew/audit.jsonl)
│   ├── mcpConfig.ts         # load MCP servers + settingSources (.crew/mcp.json)
│   ├── toolResult.ts        # summarize a tool's output payload
│   ├── gridLayout.ts        # pure grid geometry (dims, pane box, cells)
│   ├── windowing.ts         # pure transcript wrap + scroll windowing
│   └── headerStats.ts       # pure cost/token formatting + totals
├── hooks/
│   ├── useCrew.ts           # wires session events → store; dispatches commands
│   ├── useTerminalSize.ts   # terminal columns/rows + resize
│   ├── useAltScreen.ts      # enter/leave the alternate screen buffer
│   └── useGridKeys.ts       # grid pane navigation + scrolling
└── components/
    ├── App.tsx HeaderBar.tsx StatusLine.tsx Spinner.tsx theme.ts
    ├── grid/  (GridView, GridPane, PaneHeader, PaneBody, CompactList)
    ├── pane/  (AgentPane, MessageView)   sidebar/ (AgentBar)   input/ (InputBar)
```

The engine is headless and UI-agnostic: `AgentSession` emits typed events
(`delta`, `tool`, `toolResult`, `result`, `usage`, `account`, `mcp`, `status`, `session`, `error`);
the store and components only consume those. All grid/scroll/stat math lives in pure,
unit-tested `lib/` modules; components stay thin. Server/agent state lives in the SDK
sessions and is never duplicated into the store.

## Roadmap

Toward building production software with only AI. **Done:** auto-routing, verify + auto-fix,
**MCP servers**, a **safety mode** toggle, **git checkpoints** (commit-on-green + `/undo`),
**guardrails + budgets**, a **planner + task board** (`/plan` → `/run`), **session save/resume**,
**ship & observe** (`/audit` + `/ship`), and **per-agent worktrees** (opt-in isolation). The core
loop is complete. Follow-ons:

1. **Parallel `/run`** now that worktrees provide isolation (dispatch tasks concurrently).
2. **`/merge <agent>`** — merge a worktree branch back into the base branch from inside crew.
3. **Cross-agent review** — let a reviewer read a builder's worktree via `additionalDirectories`.

## Development

```bash
bun test               # 100+ unit tests (engine, store, commands, layout, windowing)
bun run test:coverage  # with coverage (95%+ on non-UI code)
bun run typecheck      # tsc --noEmit
env -u ANTHROPIC_API_KEY bun run smoke      # live end-to-end check vs the real binary
env -u ANTHROPIC_API_KEY bun run smoke:install  # install a local plugin → confirm the agent loads it
env -u ANTHROPIC_API_KEY bun run shakedown  # full plan→build→verify→checkpoint dry run in a temp repo
```

[sdk]: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
