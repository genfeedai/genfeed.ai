# ADR: Workflow-Backed Recurring Agent Automation

## Relationship To Broader Scheduling Rule

This ADR is a narrow application of
`ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md`.

If there is any conflict, the broader scheduling ADR governs platform direction.

## Rule

When the agent creates a new recurring automation:

- create a `task` for the user-facing container,
- attach it to a real `workflow`,
- treat the `workflow` as the canonical executable unit,
- ensure scheduler paths target the `workflow`,
- let users control the workflow directly.

## Guardrail

Do not ask to revisit this for new agent recurring work unless the task is explicitly a broader platform cleanup.

## Scope

This rule applies to new recurring agent automation only.
It does not require retrofitting older automation paths.
