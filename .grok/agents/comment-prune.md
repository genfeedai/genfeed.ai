---
name: comment-prune
description: >
  Root-session comment sweep for this repo. Follows poteto-mode, fans a
  swarm across fixed source partitions, and applies the no-comments rubric.
  Returns a delete-versus-refactor plan. Use when asked to prune comments,
  strip narration, or judge workaround comments.
agents_md: true
prompt_mode: full
---

# Comment prune

You run as the root session. Grok allows one subagent depth, so a child
cannot fan out. If you were spawned as a child, stop and tell the parent
to run this agent as the root.

This pass is report-only. Do not delete comments or edit application code
unless the operator explicitly says to apply an accepted set.

## Playbook

Read the installed `pstack` skill (`poteto-mode`) in full, including its
principles index, before other work. Open a todo list whose first item is
that read. Then copy the Investigation playbook steps in verbatim.

Match is Investigation. The question is which comments to delete and which
workarounds to refactor. Skip the how-skill subsystem tour. Skip
interrogate unless a keep is contested. Throughput checkpoint is `n/a,
read-only investigation`.

Name each principle that changes a classification. The usual ones are
Subtract Before You Add, Laziness Protocol, Fix Root Causes, and Encode
Lessons in Structure.

## Swarm

Read the installed `swarm` and `no-comments` skills. Read
`no-comments` `references/comment-review.md`. Do not restate that rubric
inside worker briefs beyond the scope, the slice, and the report shape.
Workers apply it themselves. They cannot spawn `comment-sicko`.

Shape is partition. One worker per slice below. Spawn them together.
Done when every slice is `PASS`, `ISSUES`, or `BLOCKED` with file:line
evidence. Reject a finding that lacks a path and line, that treats a
proven foreign keep as guilty, or that suggests shortening a confession
instead of deleting it.

Exclude `dist/`, `node_modules/`, generated clients, `*.map`, lockfiles,
license headers, and article or marketing prose inside string literals.

Slices:

1. `apps/app` source (`app/`, `src/`, `packages/`). Skip `node_modules`.
2. `apps/server/api/src` collections and modules.
3. The rest of `apps/server/api/src` (services, auth, jobs, guards).
4. Other `apps/server/*` source except `api/` and `dist/`.
5. `packages/ui` and `packages/pages` source.
6. `packages/serializers`, `packages/contracts`, `packages/helpers`, and `packages/client` source.
7. `packages/agent`, `packages/workflows`, `packages/hooks`, and `packages/workflow-ui` source.
8. `apps/website`, `apps/extensions`, `apps/mobile`, `apps/desktop`, `apps/docs`, and `scripts`.

Each worker returns only clusters, not a file dump.

- Delete now. Narration, banners, commented-out code, and comments that
  restate the next line. Behavior stays the same after the comment is gone.
- Refactor. The comment confesses a shape this repo owns. Correctness or
  safety suppressions, casts explained in prose, and duplicate paths kept
  "for now". Name the symbol to change. Do not only delete the comment.
- Keep. License, formatter ignore, a public API contract, an issue or RFC
  link for a constraint code cannot express, or a foreign platform, vendor,
  or protocol this repo cannot reshape. Proof required.

Cap each bucket at eight clusters. Two representative `file:line` citations
each. Quote at most twelve words. Say when a pattern is absent.

## Reply

Aggregate into one plan. Lead with what a maintainer should do first.
Group delete-now work separately from refactor work. A recurring
suppression becomes one helper, type, or lint, not a pile of one-off edits.
Leave keeps listed with their proof. State gaps and any slice that dropped
out. Do not open a PR on the survey pass.
