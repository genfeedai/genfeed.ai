# Claude Session Analysis

Generated: 2026-06-01T10:19:53.947Z

## Scope
- Claude roots scanned: 1
- Roots:
  - <home>/.claude
- Included subagent transcripts: no
- Requested time window: 2026-05-31T10:19:49.633Z -> now
- JSONL files scanned: 1,118
- Unique sessions: 0
- Time range: n/a -> n/a

## Event Volume
- User messages: 0
- Assistant messages: 0
- Progress events: 0
- Other events: 0

## Top Categories (User Prompt Intent)
| Category | Count |
|---|---:|
| (none) | 0 |

## Top Models
| Model | Count |
|---|---:|
| (none) | 0 |

## Top Tool Uses
| Tool | Count |
|---|---:|
| (none) | 0 |

## Top Projects
| Project | File Count |
|---|---:|
| (none) | 0 |

## Top Working Directories
| CWD | Event Count |
|---|---:|
| (none) | 0 |

## Productization Recommendations

### Skills (Human-in-the-loop reusable workflows)
1. **Monorepo Test-Fix Loop** (0 related prompts)
   - Standardize your repeated cycle: isolate failing package -> minimal fix -> targeted retest -> suite retest.
2. **Plan-to-Execution Runbook** (0 agent/skill prompts)
   - Your sessions frequently start from prewritten plans. Turn this into a deterministic execution checklist skill.
3. **Session Handoff Summarizer** (0 doc/summary prompts)
   - You repeatedly request context summaries and continuation handoffs; capture one canonical format.
4. **API Security Preflight** (0 security prompts)
   - Enforce a repeatable auth/multi-tenancy/serializer gate before merge.
5. **Content Ops Workflow** (0 content/media prompts)
   - Convert your recurring content/presentation requests into a reusable brief -> outputs pattern.

### Plugins (System/API integrations)
1. **Session Analytics Plugin**
   - Query local Claude history with filters ('repo', 'time', 'category', 'tool') without custom ad-hoc scripts.
2. **GitHub Workflow Plugin**
   - One surface for PR checks, failing workflow logs, review comments, and fix task creation.
3. **Genfeed Workflow Ops Plugin**
   - Trigger/inspect content pipeline runs and node outputs directly from agent sessions.

### Agents (Autonomous multi-step loops)
1. **CI Triage Agent**
   - Detects failing checks, proposes fixes, runs validation, and loops until pass or explicit blocker.
2. **Daily Pattern Miner Agent**
   - Mines prior day sessions, flags repeated prompt patterns, and suggests new skill candidates.
3. **Policy Guard Agent**
   - Scans active branches for cloud invariants (multi-tenancy, serializers, user ID policy, TS strictness).

### codex.md (Always-on guardrails, not workflows)
1. Keep only cross-cutting invariants and done criteria.
2. Keep repo architecture constraints and identity/security rules.
3. Keep mandatory pre-push checks and evidence requirements.
4. Do **not** put task-specific playbooks here (those belong in skills/agents).


## How to Run
```bash
bun run analyze:claude-sessions
bun run analyze:claude-sessions -- --include-subagents
bun run analyze:claude-sessions -- --previous-day
bun run analyze:claude-sessions -- --days 7
bun run analyze:claude-sessions -- --root ~/.claude --since 2026-06-01
bun run analyze:claude-sessions -- --out docs/custom-claude-analysis.md
bun run analyze:claude-sessions -- --json-out docs/custom-claude-analysis.json
bun run analyze:claude-sessions -- --no-json
```
