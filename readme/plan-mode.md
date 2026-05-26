# Plan Mode

Plan mode is a guardrail for risky or multi-step changes. When active, the agent can only **read** the codebase — it cannot write files or run shell commands. It investigates, produces a written plan, and waits for your approval before any mutating action runs.

This mirrors the "plan mode" feature in Claude Code.

## When to use it

- Multi-file refactors where you want to see the full scope before any edit.
- Risky changes (migrations, config rewrites, anything touching production-shaped code).
- New features where you want to confirm the design before implementation.
- Any time you'd rather see a plan than a diff.

For one-line tweaks or "fix this typo," plan mode is unnecessary friction — just run the agent normally.

## How to enable

Two equivalent ways:

```bash
# CLI flag (one-off)
codagent --plan "refactor the config loader"

# Env var (persistent across invocations)
PLAN_MODE=true codagent "refactor the config loader"
```

Add `PLAN_MODE=true` to your `.env` file if you want plan mode to be the default for this project.

## What happens

1. **Investigation phase.** The agent uses only `list_files` and `read_file`. If it tries to call `write_file` or `execute_shell`, the runtime blocks the call and tells the agent it must produce a plan instead.
2. **Plan output.** When the agent has enough information, it prints a written plan: context, files to change, new files, and a verification step.
3. **Approval prompt.** You're asked to choose:
   - **Approve and execute** — plan mode turns off; the agent proceeds with the plan, now able to write files and run commands.
   - **Revise (give feedback)** — you give feedback; the agent revises the plan and asks again.
   - **Cancel and exit** — the session ends with no changes made.

## Example transcript

```
$ codagent --plan "add a --verbose flag"
🗒  Plan mode active — read-only tools only. You will review the plan before execution.

Thinking...
Assistant: Checking the project layout.
Executing tool: list_files
Result: src
package.json
README.md
...

Thinking...
Assistant: Reading the CLI entrypoint.
Executing tool: read_file
Result: import { Command } from 'commander';
...

Thinking...
Assistant: Plan:
  Context — Add a --verbose flag that turns on chalk.gray debug output across the chat loop.
  Files to modify:
    - src/index.ts: register .option('--verbose', ...) and pass it to Agent.
    - src/agent/core.ts: accept verbose param; gate debug log lines on it.
  No new files.
  Verify: `codagent --verbose "hi"` shows debug lines; without the flag, output is quiet.

? Plan ready. What would you like to do?
  ❯ Approve and execute
    Revise (give feedback)
    Cancel and exit
```

## Tools blocked in plan mode

| Tool | In plan mode |
| --- | --- |
| `read_file` | ✅ Allowed |
| `list_files` | ✅ Allowed |
| `write_file` | ❌ Blocked |
| `create_directory` | ❌ Blocked |
| `execute_shell` | ❌ Blocked |

`execute_shell` is blocked outright even for commands that look read-only (`git status`, `ls`, `grep`). Parsing command strings reliably enough to allow "safe" commands is too fragile — `git status; rm -rf /` defeats any simple check. If this turns out to be too restrictive in practice, a future change can add an allowlist of exact, parameterless command prefixes.

## Troubleshooting

**The agent's plan keeps mentioning `write_file` or `execute_shell`.**
That's the language model describing what it intends to do once approved — not an attempted call. The runtime gate only fires on real tool calls.

**Approved the plan but nothing happened.**
After approval the agent receives an internal "proceed with the approved plan" message. If the agent's next turn ends with `satisfied:true` and no tool calls, it has decided no action is needed — re-prompt it with a specific instruction.

**Plan mode is on but I want to run a quick shell command.**
Cancel out, re-run without `--plan` (and without `PLAN_MODE=true` set).

## Verify it works

```bash
npm run build
codagent --plan "anything that needs investigation"
```

You should see the magenta "🗒 Plan mode active" banner, the agent should use only `list_files` / `read_file`, and an approval prompt should appear before any write.
