---
name: Codex adversarial review invocation
description: How to run Codex adversarial reviews from inside Claude Code — use the codex:codex-rescue Agent subagent, not the Skill tool
type: feedback
---

**Rule:** To run `/codex:adversarial-review` (or any Codex review/task) programmatically, dispatch the `codex:codex-rescue` subagent via the Agent tool. Do NOT try the Skill tool.

**Why:** `/codex:adversarial-review` is a user-invocable slash *command* (lives at `plugins/marketplaces/openai-codex/plugins/codex/commands/adversarial-review.md`), not a skill. Its frontmatter has `disable-model-invocation: true`, so Claude cannot invoke it via the Skill tool under any circumstance — the Skill tool will reject it with "cannot be used with Skill tool due to disable-model-invocation". Trying alternate names (`adversarial-review`, `codex:adversarial-review`) all fail the same way. The ONLY programmatic path is `Agent(subagent_type="codex:codex-rescue", ...)`, which forwards to `codex-companion.mjs` under the hood.

**How to apply:**
- Use `Agent` tool, `subagent_type: "codex:codex-rescue"`, with a clear prompt describing the review target.
- **The rescue agent defaults to dispatching with `--write` capability.** For explicitly read-only reviews, tell the rescue agent in the prompt: "This is a read-only review — dispatch the codex-companion task WITHOUT the `--write` flag." Otherwise it will repeat the default. (It admitted this was a mistake after doing it once.)
- Background Codex tasks are tracked at `/private/tmp/claude-501/<project>/<session>/tasks/<id>.output` and the rescue agent log at `.claude-genfeedai/projects/.../subagents/agent-<id>.jsonl`.
- The underlying script is the `codex-companion.mjs` helper inside the `openai-codex` Claude Code plugin (under `~/.claude*/plugins/marketplaces/openai-codex/plugins/codex/scripts/`, exact path varies per install). The `adversarial-review` subcommand reviews git diff / working tree; it does NOT review arbitrary files directly. Pass the plan file content via focus text, or reference it from a prompt that inlines the relevant excerpts.
- **Gotcha:** `codex-companion.mjs adversarial-review --help` does NOT print help. It treats `--help` as focus text and kicks off a real review. There is no built-in help flag.
- Codex task process ends by writing a final assistant message to the `.output` file. If the file stops growing and no `codex` / `codex-companion` processes appear in `ps`, the task is dead (possibly stalled mid-turn). Check with `lsof <output-file>` and `ps -ef | grep codex`.

**When to use:** Any time the user asks for `/codex:review`, `/codex:adversarial-review`, or similar — go straight to `Agent(subagent_type="codex:codex-rescue", ...)` without flailing through Skill tool attempts.

**Mandatory: run before every ExitPlanMode.** After writing the plan file but before calling ExitPlanMode, always run a Codex adversarial review against the plan. Do not skip this even for "simple" plans. The review should inline the plan content in the prompt and ask the agent to find missing steps, wrong assumptions, and edge cases. Incorporate any actionable findings into the plan file before calling ExitPlanMode.
