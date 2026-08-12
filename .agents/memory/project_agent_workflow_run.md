---
name: agent_workflow_run
description: Content agents bind to deterministic workflows; fill prompt/asset slots; run graphs without LLM tool selection for Team path
type: project
last_verified: 2026-08-12
---

# Agent → workflow content path

## Target state

Automate **Team / Agent Hub** lists content agents (`AgentStrategy`). Primary action is **Run workflow**:

1. Resolve `preferredWorkflowId`, else install/reuse `preferredWorkflowTemplateId` (or type default from `AGENT_TYPE_WORKFLOW_DEFAULTS`).
2. Fill `workflow.inputVariables` from strategy topics/voice/brand + optional UI overrides (topic, prompt, reference image, CTA).
3. `WorkflowExecutorService.executeManualWorkflow` with metadata `{ createdFrom: 'agent-strategy', agentStrategyId }`.
4. Missing required slots fail closed — no partial graph side effects.

Autopilot **Run Now** remains the skill/gateway path (secondary).

## Key files

| Layer | Path |
| --- | --- |
| Type → template map | `apps/server/api/src/collections/agent-strategies/constants/agent-type-workflow-defaults.constant.ts` |
| Fill + execute | `.../services/agent-strategy-workflow-run.service.ts` |
| API | `POST :id/run-workflow`, `GET :id/workflow-binding` |
| Binding columns | `preferredWorkflowId`, `preferredWorkflowTemplateId`, `workflowInputOverrides` (typed `[{key,value}]` — not freeform config JSON) |
| Hire presets | `packages/pages/agents/content-team/content-team-presets.ts` |
| Hub UI | `AgentHubPage` + `AgentWorkflowRunDialog` |
| Chat parity | Specialist tools include `get_workflow_inputs` / `execute_workflow` via `SHARED_READ_TOOLS` |

## Why

Users hire content roles; those agents should drive **deterministic** production graphs and only vary text/prompt/assets — not invent pipelines each run. Aligns with `ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION` and `system_workflows_content_os`.

## How to apply

- Prefer config-backed binding over new Prisma columns unless query/index needs appear.
- New agent types: add row to `AGENT_TYPE_WORKFLOW_DEFAULTS` + hire preset template id.
- Do not route Team Run Workflow through the LLM tool loop.
