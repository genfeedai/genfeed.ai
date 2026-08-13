---
name: Agent campaign backend debt
description: Config columns, dead cron removal, and AgentRuntime facade for Programs
type: project
status: completed
last_verified: 2026-08-13
---

# Agent campaign backend debt

Follow-up from the Campaigns IA cut. Closed on the backend debt PR:

1. **Dead cron removed** — `workers/src/crons/agent-campaign/` deleted; only
   workflow-backed `CampaignOrchestrationWorkflowService` remains.
2. **Config → columns** — `AgentCampaign` scalars (`status`, dates, credits,
   orchestration*) are first-class columns; `config` keeps only
   `contentQuota` / `contentRotation`. Migration
   `20260813180000_agent_campaign_config_columns` backfills with config-wins
   for `status` (fixes the draft split-brain).
3. **AgentRuntime facade** — `AgentRuntimeModule` /
   `AgentRuntimeService.startTurn` creates thread + run + queue with
   provenance. Both `AgentCampaignExecutionService` and
   `ContentEngineService` use it (required DI).
4. **Orphan cron cleanup** — deleted workflow-replaced decorator-less leftovers
   (ad-optimization, ad-sync, proactive-agent, ai-influencer, content-engine,
   reply-bot, trend-summary-notifications, youtube-analytics). Detector in
   `check-platform-cron-boundary` allowlists the 6 SystemSweeps services.
5. **Smoke** — `campaign-runtime-smoke.spec.ts` covers campaign execute →
   runtime turn → `thread.turn_requested` snapshot.
