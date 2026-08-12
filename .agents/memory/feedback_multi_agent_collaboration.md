---
name: multi-agent collaboration
description: How Claude, Codex, and Grok share one monorepo without Vincent re-stating rules each session
type: feedback
status: active
last_verified: 2026-08-12
topics: [workflow, multi-agent, claude, codex, grok, handoff, tdd, claim]
---

**Rule:** Claude, Codex, and Grok are interchangeable implementers on this repo. They **do not** share chat history. Durable coordination lives in **git-tracked project memory**, **GitHub issues/PRs**, and **tests** — never only in one session transcript. Vincent should not have to restate standing rules every session.

**Why:** Parallel hosts re-discover the same launch blockers, re-open side branches off a QA queue, push thrashing CI, or re-implement work already claimed on an open PR. Measured cost is duplicate PRs, conflicting diffs, and repeated human instructions.

**How to apply:**

### 1. Single source of truth (all hosts)

| Source | Use for |
| --- | --- |
| `.agents/memory/MEMORY.md` + linked files | Standing rules (TDD, claim, UI, enums, trunk) |
| GitHub Issues / Project #12 | Canonical backlog and status |
| Open PR body + commits | What is in flight and acceptance criteria |
| Tests + hermetic contracts | Executable proof of behavior |

At **session start** (Claude, Codex, Grok, Cursor): read `MEMORY.md`, then only topic files relevant to the task. **Do not** invent a private session backlog file for work that belongs on an issue/PR.

### 2. Host-native children; cross-provider is opt-in

- **Claude main** → Claude subagents (`sonnet` volume, `haiku` retrieval, `opus` verify).
- **Grok main** → Grok subagents.
- **Codex main** → stay on Codex.
- Route to another provider **only when Vincent names that provider in this conversation**. Cross-host agents are blind to the parent transcript — opted-in prompts must be **self-contained** (branch, issue, files, acceptance, do-not-touch list).

### 3. Claim before spawn (one surface, one lane)

Before branching, remediating red CI, or spawning a parallel lane:

```bash
gh pr list --state open --search "<file-or-symptom>"
gh pr list --state open --json number,headRefName,title
git fetch origin && git branch -r --sort=-committerdate | head -20
```

- Two lanes never share a directory tree without an explicit path-split claim (see temporary `project_parallel_*` files when active).
- Push early if the claim needs to be visible to other sessions; **local commits alone do not claim work** unless Vincent has ordered **commit-only / no push** for CI thrash reasons (then claim via issue comment + PR draft body + project memory).

### 4. Handoff contract (stop re-explaining mid-work)

When leaving work for another host or a later session, update **at least two** of:

1. Issue comment or Project status  
2. PR body (Closes / acceptance / residual)  
3. `.agents/memory/project_*.md` active file for the branch  
4. Tests that lock the acceptance criteria  

Chat-only summaries are **not** a handoff. The next agent loads memory + PR + tests and continues without asking Vincent to restate.

### 5. TDD is the shared language

All hosts follow `feedback_tdd_first.md`:

- Red → green → refactor for behavior changes.
- Prefer deterministic unit/integration and hermetic launch-path contracts over full monorepo runs on laptop.
- A fix without a test that would have failed is incomplete handoff.

### 6. QA queue / deploy-session etiquette

When Vincent names a **queue branch** (e.g. `qa/260812`) or **deploy owns CI**:

- **Stay on that branch.** No hop to master feature branches, no stash-hop, no worktree switch unless asked.
- Prefer **commit only, no push** while iterating if he forbade thrashing PR CI; do not push “to claim” against that order.
- Do **not** re-implement items listed as complete in the active `project_qa_*_closeout` memory.
- Human/ops sale-path issues stay human unless he assigns code work.

### 7. What not to put in chat as if it were durable

- “Remember for next time” without writing memory or tests  
- Branch protocol only stated once in a video-edit session  
- Acceptance criteria only in a closed chat thread  

Write them into memory + tests once; every host loads them forever.

**Done when:** A cold Claude, Codex, or Grok session can pick up the branch from MEMORY + PR + tests alone, without Vincent repeating TDD, claim, no-push, or “don’t leave the QA branch.”
