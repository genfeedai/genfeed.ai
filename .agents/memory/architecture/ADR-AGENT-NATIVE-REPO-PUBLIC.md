# ADR: Agent-Native Repository Is Public

## Status

Accepted · 2026-08-16

## Decision

`.agents/` (memory, rules, build skills), `CLAUDE.md`, and `AGENTS.md` are committed and public
on purpose: they are how this repository is built and are presented in the README as a feature
("How agents work in this repo"), not hidden as an implementation detail.

## Trade-off

Transparency and agent-contributor onboarding win over the risk that internal notes leak. The
cost is discipline: strategy, credentials, customer detail, and private operations never
enter `.agents/` (they live outside this public repository), and internal
automation labels (`shipcode:*`) are described as internal rather than removed.

## Guardrail

Publishing cannot be undone. Anything unfit for a public reader is kept out of the tree, not
committed and later scrubbed.
