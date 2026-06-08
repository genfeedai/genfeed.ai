# Claude Daily Pattern Miner

The daily pattern miner turns recent Claude session history into ranked candidates for new Genfeed skills, plugins, and autonomous agents.

## Daily Flow

1. `scripts/analyze-claude-sessions.ts` scans Claude JSONL transcripts and writes a scoped Markdown + JSON analysis.
2. `scripts/daily-pattern-miner.ts` reads the JSON analysis, scores repeated workflows, and writes `docs/claude-pattern-miner-report.md`.
3. `.github/workflows/claude-pattern-miner.yml` runs the same flow every day and uploads the analysis + report as a workflow artifact.

The workflow does not commit generated reports. Reports can contain local project names or working-directory hints, so they stay in local output or GitHub Actions artifacts.

For hosted GitHub runners, the workflow emits a valid empty report unless Claude history has been synced onto the runner. To point the workflow at explicit transcript roots, set the repository variable `CLAUDE_ROOTS` to a colon-separated list such as `/home/runner/.claude:/mnt/sessions/.claude-genfeedai`.

## Local Commands

```bash
bun run analyze:claude-sessions
bun run analyze:claude-sessions -- --previous-day
bun run analyze:claude-sessions -- --days 7 --include-subagents
bun run analyze:claude-patterns:daily
```

The analyzer auto-discovers `~/.claude*/projects` roots. To scope it explicitly:

```bash
bun run analyze:claude-sessions -- --root ~/.claude --since 2026-06-01 --until 2026-06-02
```

## Outputs

- `docs/claude-session-analysis.md` - full local analysis for all available history.
- `docs/claude-session-analysis.json` - machine-readable local analysis.
- `docs/claude-session-analysis-daily.md` - previous-day daily analysis.
- `docs/claude-session-analysis-daily.json` - machine-readable daily analysis.
- `docs/claude-pattern-miner-report.md` - ranked automation candidates and weekly promotion queue.

## Promotion Rule

Promote a candidate to a GitHub issue when the same pattern appears in three or more daily reports in a week. Keep promotion human-reviewed; the miner recommends backlog items but does not create production automations by itself.
