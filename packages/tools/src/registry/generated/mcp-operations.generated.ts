// AUTO-GENERATED — DO NOT EDIT BY HAND.
//
// Source of truth: apps/server/api/openapi/openapi.json (Phase 1 / #1247).
// Regenerate:      bun run --filter=@genfeedai/tools generate:mcp-tools
//
// 1041 MCP operation bindings for generated-tool dispatch (#1249 / #1250).

import type { IGeneratedMcpOperationBinding } from '../openapi/build-generated-mcp-tools.js';

export const GENERATED_MCP_OPERATIONS: IGeneratedMcpOperationBinding[] = [
  {
    "bodyFields": [
      "ids",
      "isDeleted",
      "isRead"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ActivitiesController.bulkUpdate",
    "path": "/activities",
    "pathParams": [],
    "queryParams": [],
    "toolName": "activities__bulk_update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ActivitiesController.findAll",
    "path": "/activities",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "activities__find_all"
  },
  {
    "bodyFields": [
      "_id",
      "brand",
      "entityId",
      "entityModel",
      "filter",
      "isDeleted",
      "isRead",
      "key",
      "organization",
      "source",
      "user",
      "value"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ActivitiesController.update",
    "path": "/activities/{activityId}",
    "pathParams": [
      "activityId"
    ],
    "queryParams": [],
    "toolName": "activities__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsGatewayController.comparePlatforms",
    "path": "/ads/compare",
    "pathParams": [],
    "queryParams": [
      "adAccountIds",
      "credentialIds",
      "datePreset",
      "loginCustomerIds",
      "platforms"
    ],
    "toolName": "ads_gateway__compare_platforms"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AdsGatewayController.createAd",
    "path": "/ads/{platform}/ads",
    "pathParams": [
      "platform"
    ],
    "queryParams": [],
    "toolName": "ads_gateway__create_ad"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AdsGatewayController.createAdSet",
    "path": "/ads/{platform}/adsets",
    "pathParams": [
      "platform"
    ],
    "queryParams": [],
    "toolName": "ads_gateway__create_ad_set"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AdsGatewayController.createCampaign",
    "path": "/ads/{platform}/campaigns",
    "pathParams": [
      "platform"
    ],
    "queryParams": [],
    "toolName": "ads_gateway__create_campaign"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsGatewayController.getAdAccounts",
    "path": "/ads/{platform}/accounts",
    "pathParams": [
      "platform"
    ],
    "queryParams": [
      "credentialId",
      "loginCustomerId"
    ],
    "toolName": "ads_gateway__get_ad_accounts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsGatewayController.getCampaignInsights",
    "path": "/ads/{platform}/campaigns/{campaignId}/insights",
    "pathParams": [
      "campaignId",
      "platform"
    ],
    "queryParams": [
      "adAccountId",
      "credentialId",
      "datePreset",
      "loginCustomerId",
      "since",
      "until"
    ],
    "toolName": "ads_gateway__get_campaign_insights"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsGatewayController.getTopPerformers",
    "path": "/ads/{platform}/top-performers",
    "pathParams": [
      "platform"
    ],
    "queryParams": [
      "adAccountId",
      "credentialId",
      "datePreset",
      "limit",
      "loginCustomerId",
      "metric"
    ],
    "toolName": "ads_gateway__get_top_performers"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsGatewayController.listAdSets",
    "path": "/ads/{platform}/adsets",
    "pathParams": [
      "platform"
    ],
    "queryParams": [
      "adAccountId",
      "campaignId",
      "credentialId",
      "loginCustomerId"
    ],
    "toolName": "ads_gateway__list_ad_sets"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsGatewayController.listAds",
    "path": "/ads/{platform}/ads",
    "pathParams": [
      "platform"
    ],
    "queryParams": [
      "adAccountId",
      "adSetId",
      "credentialId",
      "loginCustomerId"
    ],
    "toolName": "ads_gateway__list_ads"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsGatewayController.listCampaigns",
    "path": "/ads/{platform}/campaigns",
    "pathParams": [
      "platform"
    ],
    "queryParams": [
      "adAccountId",
      "credentialId",
      "loginCustomerId"
    ],
    "toolName": "ads_gateway__list_campaigns"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "put",
    "operationId": "AdsGatewayController.updateCampaign",
    "path": "/ads/{platform}/campaigns/{campaignId}",
    "pathParams": [
      "campaignId",
      "platform"
    ],
    "queryParams": [],
    "toolName": "ads_gateway__update_campaign"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AdsResearchController.createRemixWorkflow",
    "path": "/ads/research/remix-workflow",
    "pathParams": [],
    "queryParams": [],
    "toolName": "ads_research__create_remix_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AdsResearchController.generateAdPack",
    "path": "/ads/research/ad-pack",
    "pathParams": [],
    "queryParams": [],
    "toolName": "ads_research__generate_ad_pack"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsResearchController.getAdDetail",
    "path": "/ads/research/{source}/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "adAccountId",
      "credentialId",
      "loginCustomerId"
    ],
    "toolName": "ads_research__get_ad_detail"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AdsResearchController.listAds",
    "path": "/ads/research",
    "pathParams": [],
    "queryParams": [
      "adAccountId",
      "brandId",
      "brandName",
      "credentialId",
      "industry",
      "limit",
      "loginCustomerId"
    ],
    "toolName": "ads_research__list_ads"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AdsResearchController.prepareCampaignForReview",
    "path": "/ads/research/launch-prep",
    "pathParams": [],
    "queryParams": [],
    "toolName": "ads_research__prepare_campaign_for_review"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentCampaignsController.create",
    "path": "/agent-campaigns",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_campaigns__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentCampaignsController.findAll",
    "path": "/agent-campaigns",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_campaigns__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentCampaignsController.findOne",
    "path": "/agent-campaigns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_campaigns__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentCampaignsController.getCampaignStatus",
    "path": "/agent-campaigns/{id}/status",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_campaigns__get_campaign_status"
  },
  {
    "bodyFields": [
      "agents",
      "brand",
      "brief",
      "campaignLeadStrategyId",
      "contentQuota",
      "contentRotation",
      "creditsAllocated",
      "endDate",
      "label",
      "orchestrationEnabled",
      "orchestrationIntervalHours",
      "startDate",
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "AgentCampaignsController.patch",
    "path": "/agent-campaigns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_campaigns__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "AgentCampaignsController.remove",
    "path": "/agent-campaigns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_campaigns__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentMemoriesController.create",
    "path": "/agent/memories",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_memories__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentMemoriesController.list",
    "path": "/agent/memories",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_memories__list"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "AgentMemoriesController.remove",
    "path": "/agent/memories/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_memories__remove"
  },
  {
    "bodyFields": [
      "brand",
      "description",
      "endDate",
      "isActive",
      "label",
      "metric",
      "organization",
      "startDate",
      "targetValue",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AgentOrchestratorController.createGoal",
    "path": "/agent/goals",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_orchestrator__create_goal"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentOrchestratorController.createThreadTurn",
    "path": "/agent/threads/{threadId}/turns",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_orchestrator__create_thread_turn"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentOrchestratorController.createThreadTurnStream",
    "path": "/agent/threads/{threadId}/turns/stream",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_orchestrator__create_thread_turn_stream"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentOrchestratorController.createTurn",
    "path": "/agent/threads/turns",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_orchestrator__create_turn"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentOrchestratorController.createTurnStream",
    "path": "/agent/threads/turns/stream",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_orchestrator__create_turn_stream"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentOrchestratorController.getCredits",
    "path": "/agent/credits",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_orchestrator__get_credits"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentOrchestratorController.getGoal",
    "path": "/agent/goals/{goalId}",
    "pathParams": [
      "goalId"
    ],
    "queryParams": [],
    "toolName": "agent_orchestrator__get_goal"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentOrchestratorController.listGoals",
    "path": "/agent/goals",
    "pathParams": [],
    "queryParams": [
      "brandId"
    ],
    "toolName": "agent_orchestrator__list_goals"
  },
  {
    "bodyFields": [
      "description",
      "endDate",
      "isActive",
      "label",
      "metric",
      "startDate",
      "targetValue"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "AgentOrchestratorController.updateGoal",
    "path": "/agent/goals/{goalId}",
    "pathParams": [
      "goalId"
    ],
    "queryParams": [],
    "toolName": "agent_orchestrator__update_goal"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentRunsController.cancelRun",
    "path": "/runs/{id}/cancellations",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_runs__cancel_run"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentRunsController.findOne",
    "path": "/runs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_runs__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentRunsController.getActiveRuns",
    "path": "/runs/active",
    "pathParams": [],
    "queryParams": [
      "cursor",
      "limit"
    ],
    "toolName": "agent_runs__get_active_runs"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentRunsController.getBatch",
    "path": "/runs/batch",
    "pathParams": [],
    "queryParams": [
      "ids"
    ],
    "toolName": "agent_runs__get_batch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentRunsController.getRunContent",
    "path": "/runs/{id}/content",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_runs__get_run_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentRunsController.getStats",
    "path": "/runs/stats",
    "pathParams": [],
    "queryParams": [
      "timeRange"
    ],
    "toolName": "agent_runs__get_stats"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "AgentRunsController.patch",
    "path": "/runs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_runs__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "AgentRunsController.remove",
    "path": "/runs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_runs__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentRunsController.retryRun",
    "path": "/runs/{id}/retries",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_runs__retry_run"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentStrategiesController.create",
    "path": "/agent-strategies",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_strategies__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentStrategiesController.findAll",
    "path": "/agent-strategies",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_strategies__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentStrategiesController.findOne",
    "path": "/agent-strategies/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentStrategiesController.listOpportunities",
    "path": "/agent-strategies/{id}/opportunities",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__list_opportunities"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentStrategiesController.listReports",
    "path": "/agent-strategies/{id}/reports",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__list_reports"
  },
  {
    "bodyFields": [
      "agentType",
      "autoPublishConfidenceThreshold",
      "autonomyMode",
      "brand",
      "budgetPolicy",
      "contentMix",
      "dailyCreditBudget",
      "dailyCreditResetAt",
      "dailyResetAt",
      "displayRole",
      "engagementEnabled",
      "engagementKeywords",
      "engagementTone",
      "goalId",
      "goalProfile",
      "isActive",
      "isEnabled",
      "label",
      "maxEngagementsPerDay",
      "minCreditThreshold",
      "model",
      "monthlyResetAt",
      "nextRunAt",
      "opportunitySources",
      "organization",
      "platforms",
      "postsPerWeek",
      "preferredPostingTimes",
      "publishPolicy",
      "qualityTier",
      "rankingPolicy",
      "reportingPolicy",
      "reportsToLabel",
      "runFrequency",
      "skillSlugs",
      "teamGroup",
      "timezone",
      "topics",
      "user",
      "voice",
      "weeklyCreditBudget"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "AgentStrategiesController.patch",
    "path": "/agent-strategies/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentStrategiesController.performanceSnapshot",
    "path": "/agent-strategies/{id}/performance-snapshot",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__performance_snapshot"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "AgentStrategiesController.remove",
    "path": "/agent-strategies/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentStrategiesController.reportNow",
    "path": "/agent-strategies/{id}/report-now",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__report_now"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentStrategiesController.runNow",
    "path": "/agent-strategies/{id}/run-now",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "agent_strategies__run_now"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentThreadRuntimeController.branchThread",
    "path": "/agent/threads/{threadId}/branches",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_thread_runtime__branch_thread"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentThreadRuntimeController.getSnapshot",
    "path": "/agent/threads/{threadId}/snapshot",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_thread_runtime__get_snapshot"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentThreadRuntimeController.listEvents",
    "path": "/agent/threads/{threadId}/events",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [
      "afterSequence"
    ],
    "toolName": "agent_thread_runtime__list_events"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentThreadRuntimeController.respondToInputRequest",
    "path": "/agent/threads/{threadId}/input-requests/{requestId}/responses",
    "pathParams": [
      "requestId",
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_thread_runtime__respond_to_input_request"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentThreadRuntimeController.respondToUiAction",
    "path": "/agent/threads/{threadId}/ui-actions",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_thread_runtime__respond_to_ui_action"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentThreadsController.addMessage",
    "path": "/agent/threads/{threadId}/messages",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_threads__add_message"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "AgentThreadsController.bulkUpdateThreads",
    "path": "/agent/threads",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_threads__bulk_update_threads"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentThreadsController.createThread",
    "path": "/agent/threads",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_threads__create_thread"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentThreadsController.getMessage",
    "path": "/agent/threads/{threadId}/messages/{messageId}",
    "pathParams": [
      "messageId",
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_threads__get_message"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentThreadsController.getMessages",
    "path": "/agent/threads/{threadId}/messages",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [
      "cursor",
      "limit"
    ],
    "toolName": "agent_threads__get_messages"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentThreadsController.getThread",
    "path": "/agent/threads/{threadId}",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_threads__get_thread"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentThreadsController.listThreads",
    "path": "/agent/threads",
    "pathParams": [],
    "queryParams": [
      "status"
    ],
    "toolName": "agent_threads__list_threads"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentThreadsController.resolveMessageArtifactReferences",
    "path": "/agent/threads/{threadId}/messages/{messageId}/artifact-references",
    "pathParams": [
      "messageId",
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_threads__resolve_message_artifact_references"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "AgentThreadsController.updateThread",
    "path": "/agent/threads/{threadId}",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_threads__update_thread"
  },
  {
    "bodyFields": [
      "brandId",
      "expectedContextVersion"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "AgentThreadsController.updateThreadContext",
    "path": "/agent/threads/{threadId}/context",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [],
    "toolName": "agent_threads__update_thread_context"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentToolsController.execute",
    "path": "/agent-tools/{name}/execute",
    "pathParams": [
      "name"
    ],
    "queryParams": [],
    "toolName": "agent_tools__execute"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AgentWorkflowsController.approve",
    "path": "/agent-workflows/{workflowId}/approve",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "agent_workflows__approve"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AgentWorkflowsController.createWorkflow",
    "path": "/agent-workflows",
    "pathParams": [],
    "queryParams": [],
    "toolName": "agent_workflows__create_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AgentWorkflowsController.forceAdvance",
    "path": "/agent-workflows/{workflowId}/force-advance",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "agent_workflows__force_advance"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AgentWorkflowsController.getWorkflow",
    "path": "/agent-workflows/{workflowId}",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "agent_workflows__get_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AgentWorkflowsController.rollback",
    "path": "/agent-workflows/{workflowId}/rollback",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "agent_workflows__rollback"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AgentWorkflowsController.transition",
    "path": "/agent-workflows/{workflowId}/transition",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "agent_workflows__transition"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AiActionsController.execute",
    "path": "/organizations/{organizationId}/ai-actions/execute",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "ai_actions__execute"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.exportData",
    "path": "/analytics/export",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "fields",
      "format",
      "organization",
      "platform",
      "postId",
      "startDate"
    ],
    "toolName": "analytics__export_data"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.findAll",
    "path": "/analytics",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "analytics__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getBrandsLeaderboard",
    "path": "/analytics/brands/leaderboard",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "limit",
      "sort",
      "startDate"
    ],
    "toolName": "analytics__get_brands_leaderboard"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getBrandsWithStats",
    "path": "/analytics/brands",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "limit",
      "page",
      "sort",
      "startDate"
    ],
    "toolName": "analytics__get_brands_with_stats"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getBusinessAnalytics",
    "path": "/analytics/business",
    "pathParams": [],
    "queryParams": [],
    "toolName": "analytics__get_business_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getEngagement",
    "path": "/analytics/engagement",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "platform",
      "startDate"
    ],
    "toolName": "analytics__get_engagement"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getGrowthTrends",
    "path": "/analytics/growth",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "metric",
      "startDate"
    ],
    "toolName": "analytics__get_growth_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getOrganizationsLeaderboard",
    "path": "/analytics/organizations/leaderboard",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "limit",
      "sort",
      "startDate"
    ],
    "toolName": "analytics__get_organizations_leaderboard"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getOrganizationsWithStats",
    "path": "/analytics/organizations",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "limit",
      "page",
      "sort",
      "startDate"
    ],
    "toolName": "analytics__get_organizations_with_stats"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getOverview",
    "path": "/analytics/overview",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "startDate"
    ],
    "toolName": "analytics__get_overview"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getPlatformComparison",
    "path": "/analytics/platforms",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "startDate"
    ],
    "toolName": "analytics__get_platform_comparison"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getTimeSeries",
    "path": "/analytics/timeseries",
    "pathParams": [],
    "queryParams": [
      "endDate",
      "startDate"
    ],
    "toolName": "analytics__get_time_series"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getTopContent",
    "path": "/analytics/top",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "limit",
      "metric",
      "platform",
      "startDate"
    ],
    "toolName": "analytics__get_top_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getTrends",
    "path": "/analytics/trends",
    "pathParams": [],
    "queryParams": [],
    "toolName": "analytics__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsController.getViralHooks",
    "path": "/analytics/hooks",
    "pathParams": [],
    "queryParams": [
      "brand",
      "endDate",
      "organization",
      "startDate"
    ],
    "toolName": "analytics__get_viral_hooks"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AnalyticsSyncController.getSyncStatus",
    "path": "/content-performance/analytics-sync/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "analytics_sync__get_sync_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AnalyticsSyncController.runSync",
    "path": "/content-performance/analytics-sync/run",
    "pathParams": [],
    "queryParams": [],
    "toolName": "analytics_sync__run_sync"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AnalyticsSyncController.sendDigest",
    "path": "/content-performance/analytics-sync/digest/send",
    "pathParams": [],
    "queryParams": [],
    "toolName": "analytics_sync__send_digest"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AnalyticsSyncController.triggerDigest",
    "path": "/content-performance/analytics-sync/digest",
    "pathParams": [],
    "queryParams": [],
    "toolName": "analytics_sync__trigger_digest"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AnalyticsSyncController.triggerSync",
    "path": "/content-performance/analytics-sync/trigger",
    "pathParams": [],
    "queryParams": [],
    "toolName": "analytics_sync__trigger_sync"
  },
  {
    "bodyFields": [
      "allowedIps",
      "category",
      "description",
      "expiresAt",
      "label",
      "metadata",
      "rateLimit",
      "scopes"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ApiKeysController.create",
    "path": "/api-keys",
    "pathParams": [],
    "queryParams": [],
    "toolName": "api_keys__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ApiKeysController.findAll",
    "path": "/api-keys",
    "pathParams": [],
    "queryParams": [
      "brand",
      "description",
      "isDeleted",
      "isFavorite",
      "label",
      "limit",
      "organization",
      "page",
      "pagination",
      "search",
      "sort"
    ],
    "toolName": "api_keys__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ApiKeysController.findOne",
    "path": "/api-keys/{apiKeyId}",
    "pathParams": [
      "apiKeyId"
    ],
    "queryParams": [],
    "toolName": "api_keys__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ApiKeysController.revoke",
    "path": "/api-keys/{apiKeyId}",
    "pathParams": [
      "apiKeyId"
    ],
    "queryParams": [],
    "toolName": "api_keys__revoke"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ApiKeysController.rotate",
    "path": "/api-keys/{apiKeyId}/rotate",
    "pathParams": [
      "apiKeyId"
    ],
    "queryParams": [],
    "toolName": "api_keys__rotate"
  },
  {
    "bodyFields": [
      "allowedIps",
      "category",
      "description",
      "expiresAt",
      "isDeleted",
      "label",
      "metadata",
      "rateLimit",
      "scopes"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ApiKeysController.update",
    "path": "/api-keys/{apiKeyId}",
    "pathParams": [
      "apiKeyId"
    ],
    "queryParams": [],
    "toolName": "api_keys__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ApiKeysController.validate",
    "path": "/api-keys/validate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "api_keys__validate"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ArticlesController.analyzeVirality",
    "path": "/articles/{articleId}/virality-analyses",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__analyze_virality"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ArticlesController.convertToThread",
    "path": "/articles/{articleId}/thread-conversions",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__convert_to_thread"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ArticlesController.create",
    "path": "/articles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "articles__create"
  },
  {
    "bodyFields": [
      "instructions",
      "label"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ArticlesController.createRemix",
    "path": "/articles/{articleId}/remixes",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__create_remix"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ArticlesController.editWithAI",
    "path": "/articles/{articleId}/enhancements",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__edit_with_ai"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ArticlesController.findAll",
    "path": "/articles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "articles__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ArticlesController.findOne",
    "path": "/articles/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "articles__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ArticlesController.generateArticles",
    "path": "/articles/generations",
    "pathParams": [],
    "queryParams": [],
    "toolName": "articles__generate_articles"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ArticlesController.generateImageFromArticle",
    "path": "/articles/{articleId}/images",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__generate_image_from_article"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ArticlesController.generatePrompt",
    "path": "/articles/{articleId}/prompts",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__generate_prompt"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ArticlesController.generateVideoFromArticle",
    "path": "/articles/{articleId}/videos",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__generate_video_from_article"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ArticlesController.getVersions",
    "path": "/articles/{articleId}/versions",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__get_versions"
  },
  {
    "bodyFields": [
      "banner",
      "category",
      "content",
      "generationPrompt",
      "isDeleted",
      "label",
      "publishedAt",
      "restoreFromVersionId",
      "scope",
      "slug",
      "status",
      "summary",
      "tags",
      "viralityAnalysis"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ArticlesController.patch",
    "path": "/articles/{articleId}",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ArticlesController.remove",
    "path": "/articles/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "articles__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ArticlesController.reviewArticle",
    "path": "/articles/{articleId}/reviews",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__review_article"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ArticlesController.scoreSeo",
    "path": "/articles/{articleId}/seo-scores",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "articles__score_seo"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AssetsController.findAll",
    "path": "/assets",
    "pathParams": [],
    "queryParams": [
      "brand",
      "category",
      "isDeleted",
      "isFavorite",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "parentModel",
      "sort"
    ],
    "toolName": "assets__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AssetsController.findOne",
    "path": "/assets/{assetId}",
    "pathParams": [
      "assetId"
    ],
    "queryParams": [],
    "toolName": "assets__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "AssetsController.remove",
    "path": "/assets/{assetId}",
    "pathParams": [
      "assetId"
    ],
    "queryParams": [],
    "toolName": "assets__remove"
  },
  {
    "bodyFields": [
      "category",
      "externalId",
      "isDeleted",
      "parent",
      "parentModel"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "AssetsController.update",
    "path": "/assets/{assetId}",
    "pathParams": [
      "assetId"
    ],
    "queryParams": [],
    "toolName": "assets__update"
  },
  {
    "bodyFields": [
      "category",
      "ingredientId",
      "parent"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AssetsOperationsController.createFromIngredient",
    "path": "/assets/from-ingredient",
    "pathParams": [],
    "queryParams": [],
    "toolName": "assets_operations__create_from_ingredient"
  },
  {
    "bodyFields": [
      "category",
      "parent",
      "parentModel"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AssetsOperationsController.createUpload",
    "path": "/assets/upload",
    "pathParams": [],
    "queryParams": [],
    "toolName": "assets_operations__create_upload"
  },
  {
    "bodyFields": [
      "category",
      "model",
      "parent",
      "parentModel",
      "text"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AssetsOperationsController.generate",
    "path": "/assets/generate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "assets_operations__generate"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AuthBootstrapController.bootstrap",
    "path": "/auth/bootstrap",
    "pathParams": [],
    "queryParams": [],
    "toolName": "auth_bootstrap__bootstrap"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AuthBootstrapController.overviewBootstrap",
    "path": "/auth/bootstrap/overview",
    "pathParams": [],
    "queryParams": [],
    "toolName": "auth_bootstrap__overview_bootstrap"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "AuthCliController.createCliToken",
    "path": "/auth/cli/token",
    "pathParams": [],
    "queryParams": [],
    "toolName": "auth_cli__create_cli_token"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AuthDesktopController.authorize",
    "path": "/auth/desktop/authorize",
    "pathParams": [],
    "queryParams": [],
    "toolName": "auth_desktop__authorize"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AuthDesktopController.exchange",
    "path": "/auth/desktop/exchange",
    "pathParams": [],
    "queryParams": [],
    "toolName": "auth_desktop__exchange"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AuthWhoamiController.whoami",
    "path": "/auth/whoami",
    "pathParams": [],
    "queryParams": [],
    "toolName": "auth_whoami__whoami"
  },
  {
    "bodyFields": [
      "aspectRatio",
      "audioUrl",
      "avatarId",
      "clonedVoiceId",
      "elevenlabsVoiceId",
      "heygenVoiceId",
      "photoUrl",
      "text",
      "useIdentity",
      "voiceProvider"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "AvatarVideoController.createAvatarVideo",
    "path": "/videos/avatar",
    "pathParams": [],
    "queryParams": [],
    "toolName": "avatar_video__create_avatar_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AvatarsController.findAll",
    "path": "/avatars",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "avatars__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AvatarsController.getElevenlabsVoices",
    "path": "/avatars/elevenlabs/voices",
    "pathParams": [],
    "queryParams": [],
    "toolName": "avatars__get_elevenlabs_voices"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AvatarsController.getHedraAvatars",
    "path": "/avatars/hedra/avatars",
    "pathParams": [],
    "queryParams": [],
    "toolName": "avatars__get_hedra_avatars"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AvatarsController.getHedraVoices",
    "path": "/avatars/hedra/voices",
    "pathParams": [],
    "queryParams": [],
    "toolName": "avatars__get_hedra_voices"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AvatarsController.getHeygenAvatars",
    "path": "/avatars/heygen/avatars",
    "pathParams": [],
    "queryParams": [],
    "toolName": "avatars__get_heygen_avatars"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "AvatarsController.getHeygenVoices",
    "path": "/avatars/heygen/voices",
    "pathParams": [],
    "queryParams": [],
    "toolName": "avatars__get_heygen_voices"
  },
  {
    "bodyFields": [
      "count",
      "params",
      "skillSlug"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BatchContentController.createBatch",
    "path": "/brands/{brandId}/content/batch",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "batch_content__create_batch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BatchContentController.getBatchStatus",
    "path": "/brands/{brandId}/content/batch/{batchId}",
    "pathParams": [
      "batchId",
      "brandId"
    ],
    "queryParams": [],
    "toolName": "batch_content__get_batch_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BatchGenerationController.createBatch",
    "path": "/batches",
    "pathParams": [],
    "queryParams": [],
    "toolName": "batch_generation__create_batch"
  },
  {
    "bodyFields": [
      "brandId",
      "items"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BatchGenerationController.createManualReviewBatch",
    "path": "/batches/manual-review",
    "pathParams": [],
    "queryParams": [],
    "toolName": "batch_generation__create_manual_review_batch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BatchGenerationController.getBatch",
    "path": "/batches/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "batch_generation__get_batch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BatchGenerationController.getBatches",
    "path": "/batches",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset",
      "status"
    ],
    "toolName": "batch_generation__get_batches"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BatchGenerationController.itemAction",
    "path": "/batches/{id}/items/action",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "batch_generation__item_action"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "BatchGenerationController.patch",
    "path": "/batches/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "batch_generation__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "BatchGenerationController.processBatch",
    "path": "/batches/{id}/process",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "batch_generation__process_batch"
  },
  {
    "bodyFields": [
      "cameraPrompt",
      "duration",
      "format",
      "isLoopMode",
      "isMergeEnabled",
      "modelKey",
      "pairs",
      "promptTemplate",
      "useTemplate"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BatchInterpolationController.createBatchInterpolation",
    "path": "/videos/interpolation",
    "pathParams": [],
    "queryParams": [],
    "toolName": "batch_interpolation__create_batch_interpolation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "BeehiivController.connect",
    "path": "/services/beehiiv/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "beehiiv__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "BeehiivController.createSubscriber",
    "path": "/services/beehiiv/subscribers",
    "pathParams": [],
    "queryParams": [],
    "toolName": "beehiiv__create_subscriber"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BeehiivController.getSubscribers",
    "path": "/services/beehiiv/subscribers",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "limit",
      "page"
    ],
    "toolName": "beehiiv__get_subscribers"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BeehiivController.listPublications",
    "path": "/services/beehiiv/publications",
    "pathParams": [],
    "queryParams": [
      "brandId"
    ],
    "toolName": "beehiiv__list_publications"
  },
  {
    "bodyFields": [
      "author",
      "authorHandle",
      "brand",
      "category",
      "content",
      "description",
      "folder",
      "intent",
      "mediaUrls",
      "platform",
      "platformData",
      "tags",
      "thumbnailUrl",
      "title",
      "url"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BookmarksController.create",
    "path": "/bookmarks",
    "pathParams": [],
    "queryParams": [],
    "toolName": "bookmarks__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BookmarksController.findAll",
    "path": "/bookmarks",
    "pathParams": [],
    "queryParams": [
      "brand",
      "category",
      "folder",
      "intent",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "platform",
      "search",
      "sort"
    ],
    "toolName": "bookmarks__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BookmarksController.findOne",
    "path": "/bookmarks/{bookmarkId}",
    "pathParams": [
      "bookmarkId"
    ],
    "queryParams": [],
    "toolName": "bookmarks__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "BookmarksController.remove",
    "path": "/bookmarks/{bookmarkId}",
    "pathParams": [
      "bookmarkId"
    ],
    "queryParams": [],
    "toolName": "bookmarks__remove"
  },
  {
    "bodyFields": [
      "author",
      "authorHandle",
      "brand",
      "category",
      "content",
      "description",
      "folder",
      "intent",
      "mediaUrls",
      "platform",
      "platformData",
      "tags",
      "thumbnailUrl",
      "title",
      "url"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "BookmarksController.update",
    "path": "/bookmarks/{bookmarkId}",
    "pathParams": [
      "bookmarkId"
    ],
    "queryParams": [],
    "toolName": "bookmarks__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BotActivitiesController.findAll",
    "path": "/bot-activities",
    "pathParams": [],
    "queryParams": [
      "botType",
      "fromDate",
      "limit",
      "monitoredAccount",
      "offset",
      "replyBotConfig",
      "status",
      "toDate"
    ],
    "toolName": "bot_activities__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BotActivitiesController.findOne",
    "path": "/bot-activities/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bot_activities__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BotActivitiesController.getStats",
    "path": "/bot-activities/stats/summary",
    "pathParams": [],
    "queryParams": [
      "fromDate",
      "replyBotConfig",
      "toDate"
    ],
    "toolName": "bot_activities__get_stats"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "BotsController.create",
    "path": "/bots",
    "pathParams": [],
    "queryParams": [],
    "toolName": "bots__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BotsController.findAll",
    "path": "/bots",
    "pathParams": [],
    "queryParams": [],
    "toolName": "bots__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BotsController.findOne",
    "path": "/bots/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BotsController.getLivestreamSession",
    "path": "/bots/{id}/livestream-session",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__get_livestream_session"
  },
  {
    "bodyFields": [
      "audioUrl",
      "confidence",
      "language",
      "prompt",
      "text"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BotsController.ingestLivestreamTranscript",
    "path": "/bots/{id}/livestream-session/transcript",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__ingest_livestream_transcript"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "BotsController.patch",
    "path": "/bots/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__patch"
  },
  {
    "bodyFields": [
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "BotsController.patchLivestreamSession",
    "path": "/bots/{id}/livestream-session",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__patch_livestream_session"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "BotsController.remove",
    "path": "/bots/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__remove"
  },
  {
    "bodyFields": [
      "message",
      "platform",
      "type"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BotsController.sendLivestreamMessageNow",
    "path": "/bots/{id}/livestream-session/send-now",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__send_livestream_message_now"
  },
  {
    "bodyFields": [
      "activeLinkId",
      "promotionAngle",
      "topic"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BotsController.updateLivestreamOverride",
    "path": "/bots/{id}/livestream-session/override",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "bots__update_livestream_override"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "BrandInterviewController.abandon",
    "path": "/brands/interview/{interviewId}/abandon",
    "pathParams": [
      "interviewId"
    ],
    "queryParams": [],
    "toolName": "brand_interview__abandon"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandInterviewController.getActiveForBrand",
    "path": "/brands/{brandId}/interview/active",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "brand_interview__get_active_for_brand"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandInterviewController.getById",
    "path": "/brands/interview/{interviewId}",
    "pathParams": [
      "interviewId"
    ],
    "queryParams": [],
    "toolName": "brand_interview__get_by_id"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandInterviewController.getCompleteness",
    "path": "/brands/{brandId}/completeness",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "brand_interview__get_completeness"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "BrandInterviewController.skipField",
    "path": "/brands/interview/{interviewId}/skip",
    "pathParams": [
      "interviewId"
    ],
    "queryParams": [],
    "toolName": "brand_interview__skip_field"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandInterviewController.start",
    "path": "/brands/{brandId}/interview",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "brand_interview__start"
  },
  {
    "bodyFields": [
      "answer"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandInterviewController.submitAnswer",
    "path": "/brands/interview/{interviewId}/answer",
    "pathParams": [
      "interviewId"
    ],
    "queryParams": [],
    "toolName": "brand_interview__submit_answer"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "BrandMemoryController.distillMemory",
    "path": "/brands/{brandId}/memory/distill",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "brand_memory__distill_memory"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandMemoryController.getInsights",
    "path": "/brands/{brandId}/memory/insights",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "limit"
    ],
    "toolName": "brand_memory__get_insights"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandMemoryController.getMemory",
    "path": "/brands/{brandId}/memory",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "from",
      "to"
    ],
    "toolName": "brand_memory__get_memory"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.addReferenceImages",
    "path": "/brands/{id}/reference-images",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__add_reference_images"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.applyBrandKitDraft",
    "path": "/brands/{id}/brand-kit/apply",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__apply_brand_kit_draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.crawlBrandKitWebsite",
    "path": "/brands/{id}/brand-kit/crawl",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__crawl_brand_kit_website"
  },
  {
    "bodyFields": [
      "backgroundColor",
      "defaultImageModel",
      "defaultImageToVideoModel",
      "defaultMusicModel",
      "defaultVideoModel",
      "description",
      "fontFamily",
      "isActive",
      "isDarkroomEnabled",
      "isHighlighted",
      "isSelected",
      "label",
      "music",
      "primaryColor",
      "scope",
      "secondaryColor",
      "slug",
      "text",
      "voice"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.create",
    "path": "/brands",
    "pathParams": [],
    "queryParams": [],
    "toolName": "brands__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.createManualBrandKitDraft",
    "path": "/brands/{id}/brand-kit/manual",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__create_manual_brand_kit_draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsController.findAll",
    "path": "/brands",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "brands__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsController.findOne",
    "path": "/brands/{brandId}",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "brands__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsController.findOneBySlug",
    "path": "/brands/slug",
    "pathParams": [],
    "queryParams": [
      "slug"
    ],
    "toolName": "brands__find_one_by_slug"
  },
  {
    "bodyFields": [
      "brandId",
      "examplesToAvoid",
      "examplesToEmulate",
      "industry",
      "offering",
      "targetAudience",
      "url"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.generateBrandVoice",
    "path": "/brands/{id}/agent-config/generate-voice",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__generate_brand_voice"
  },
  {
    "bodyFields": [
      "angle",
      "count",
      "formats"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.generateFastlaneIdeas",
    "path": "/brands/{id}/fastlane/ideas",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__generate_fastlane_ideas"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsController.getStrategyTemplates",
    "path": "/brands/agent-config/strategy-templates",
    "pathParams": [],
    "queryParams": [],
    "toolName": "brands__get_strategy_templates"
  },
  {
    "bodyFields": [
      "assets"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.importBrandKitAssets",
    "path": "/brands/{id}/brand-kit/assets/import",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__import_brand_kit_assets"
  },
  {
    "bodyFields": [
      "agentConfig",
      "backgroundColor",
      "defaultImageModel",
      "defaultImageToVideoModel",
      "defaultMusicModel",
      "defaultVideoModel",
      "description",
      "fontFamily",
      "isActive",
      "isDarkroomEnabled",
      "isDeleted",
      "isHighlighted",
      "isSelected",
      "label",
      "music",
      "organizationId",
      "organizationLabel",
      "primaryColor",
      "referenceImages",
      "relocationAck",
      "scope",
      "secondaryColor",
      "slug",
      "syncOrganizationName",
      "text",
      "user",
      "voice"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "BrandsController.patch",
    "path": "/brands/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsController.previewRelocation",
    "path": "/brands/{id}/relocation-preview",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "organizationId"
    ],
    "toolName": "brands__preview_relocation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "BrandsController.remove",
    "path": "/brands/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__remove"
  },
  {
    "bodyFields": [
      "additionalNotes",
      "brandName",
      "brandUrl",
      "industry",
      "linkedinUrl",
      "organizationName",
      "targetAudience",
      "xProfileUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "BrandsController.scrapeBrand",
    "path": "/brands/{id}/scrape",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__scrape_brand"
  },
  {
    "bodyFields": [
      "autoPublish",
      "defaultAvatarIngredientId",
      "defaultAvatarPhotoUrl",
      "defaultModel",
      "defaultVoiceId",
      "defaultVoiceRef",
      "enabledSkills",
      "heygenAvatarId",
      "heygenVoiceId",
      "persona",
      "platformOverrides",
      "schedule",
      "strategy",
      "voice"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "BrandsController.updateAgentConfig",
    "path": "/brands/{id}/agent-config",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__update_agent_config"
  },
  {
    "bodyFields": [
      "enabledSkills"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "BrandsController.updateEnabledSkills",
    "path": "/brands/{id}/agent-config/enabled-skills",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "brands__update_enabled_skills"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findAllActivities",
    "path": "/brands/{brandId}/activities",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "brands_relationships__find_all_activities"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findAllPosts",
    "path": "/brands/{brandId}/posts",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "credential",
      "endDate",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "platform",
      "sort",
      "startDate",
      "status"
    ],
    "toolName": "brands_relationships__find_all_posts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandAnalytics",
    "path": "/brands/{brandId}/analytics",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "startDate"
    ],
    "toolName": "brands_relationships__find_brand_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandAnalyticsTimeSeries",
    "path": "/brands/{brandId}/analytics/timeseries",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "groupBy",
      "startDate"
    ],
    "toolName": "brands_relationships__find_brand_analytics_time_series"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandArticles",
    "path": "/brands/{brandId}/articles",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "category",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "scope",
      "search",
      "sort",
      "sortBy",
      "sortOrder",
      "status",
      "tag"
    ],
    "toolName": "brands_relationships__find_brand_articles"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandCredentials",
    "path": "/brands/{brandId}/credentials",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "brands_relationships__find_brand_credentials"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandImages",
    "path": "/brands/{brandId}/images",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "isPublic",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "references",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "brands_relationships__find_brand_images"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandLinks",
    "path": "/brands/{brandId}/links",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "brands_relationships__find_brand_links"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandMusics",
    "path": "/brands/{brandId}/musics",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "brands_relationships__find_brand_musics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandPlatformAnalytics",
    "path": "/brands/{brandId}/platforms/{platform}/analytics",
    "pathParams": [
      "brandId",
      "platform"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "startDate"
    ],
    "toolName": "brands_relationships__find_brand_platform_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "BrandsRelationshipsController.findBrandVideos",
    "path": "/brands/{brandId}/videos",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "reference",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "brands_relationships__find_brand_videos"
  },
  {
    "bodyFields": [
      "format",
      "ingredient",
      "language"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "CaptionsController.create",
    "path": "/captions",
    "pathParams": [],
    "queryParams": [],
    "toolName": "captions__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CaptionsController.findAll",
    "path": "/captions",
    "pathParams": [],
    "queryParams": [
      "brand",
      "format",
      "isDeleted",
      "isFavorite",
      "language",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "captions__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CaptionsController.findOne",
    "path": "/captions/{captionId}",
    "pathParams": [
      "captionId"
    ],
    "queryParams": [],
    "toolName": "captions__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "CaptionsController.remove",
    "path": "/captions/{captionId}",
    "pathParams": [
      "captionId"
    ],
    "queryParams": [],
    "toolName": "captions__remove"
  },
  {
    "bodyFields": [
      "content",
      "format",
      "ingredient",
      "isDeleted",
      "language"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "CaptionsController.update",
    "path": "/captions/{captionId}",
    "pathParams": [
      "captionId"
    ],
    "queryParams": [],
    "toolName": "captions__update"
  },
  {
    "bodyFields": [
      "language",
      "maxClips",
      "minViralityScore",
      "name",
      "youtubeUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ClipProjectsController.analyzeYoutube",
    "path": "/clip-projects/analyze",
    "pathParams": [],
    "queryParams": [],
    "toolName": "clip_projects__analyze_youtube"
  },
  {
    "bodyFields": [
      "_id",
      "language",
      "name",
      "organization",
      "settings",
      "sourceVideoS3Key",
      "sourceVideoUrl",
      "status",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ClipProjectsController.create",
    "path": "/clip-projects",
    "pathParams": [],
    "queryParams": [],
    "toolName": "clip_projects__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ClipProjectsController.createEditorHandoff",
    "path": "/clip-projects/{projectId}/results/{clipResultId}/editor-handoff",
    "pathParams": [
      "clipResultId",
      "projectId"
    ],
    "queryParams": [],
    "toolName": "clip_projects__create_editor_handoff"
  },
  {
    "bodyFields": [
      "avatarId",
      "avatarProvider",
      "language",
      "maxClips",
      "minViralityScore",
      "name",
      "voiceId",
      "youtubeUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ClipProjectsController.createFromYoutube",
    "path": "/clip-projects/from-youtube",
    "pathParams": [],
    "queryParams": [],
    "toolName": "clip_projects__create_from_youtube"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ClipProjectsController.createPublishHandoff",
    "path": "/clip-projects/{projectId}/results/{clipResultId}/publish-handoff",
    "pathParams": [
      "clipResultId",
      "projectId"
    ],
    "queryParams": [],
    "toolName": "clip_projects__create_publish_handoff"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ClipProjectsController.findAll",
    "path": "/clip-projects",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "clip_projects__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ClipProjectsController.findOne",
    "path": "/clip-projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "clip_projects__find_one"
  },
  {
    "bodyFields": [
      "avatarId",
      "avatarProvider",
      "editedHighlights",
      "selectedHighlightIds",
      "voiceId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ClipProjectsController.generateClips",
    "path": "/clip-projects/{projectId}/generate",
    "pathParams": [
      "projectId"
    ],
    "queryParams": [],
    "toolName": "clip_projects__generate_clips"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ClipProjectsController.getHighlights",
    "path": "/clip-projects/{projectId}/highlights",
    "pathParams": [
      "projectId"
    ],
    "queryParams": [],
    "toolName": "clip_projects__get_highlights"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ClipProjectsController.rewriteHighlight",
    "path": "/clip-projects/{projectId}/highlights/{highlightId}/rewrite",
    "pathParams": [
      "highlightId",
      "projectId"
    ],
    "queryParams": [],
    "toolName": "clip_projects__rewrite_highlight"
  },
  {
    "bodyFields": [
      "_id",
      "error",
      "failedClipCount",
      "isDeleted",
      "language",
      "name",
      "organization",
      "pendingClipCount",
      "progress",
      "readiness",
      "readyClipCount",
      "settings",
      "sourceVideoS3Key",
      "sourceVideoUrl",
      "status",
      "terminalAt",
      "transcriptSegments",
      "transcriptSrt",
      "transcriptText",
      "user",
      "videoMetadata"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ClipProjectsController.update",
    "path": "/clip-projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "clip_projects__update"
  },
  {
    "bodyFields": [
      "_id",
      "clipType",
      "duration",
      "endTime",
      "index",
      "isSelected",
      "mode",
      "organization",
      "project",
      "providerJobId",
      "providerName",
      "readiness",
      "startTime",
      "status",
      "summary",
      "tags",
      "terminalAt",
      "title",
      "user",
      "viralityScore"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ClipResultsController.create",
    "path": "/clip-results",
    "pathParams": [],
    "queryParams": [],
    "toolName": "clip_results__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ClipResultsController.findAll",
    "path": "/clip-results",
    "pathParams": [],
    "queryParams": [
      "filter[project]",
      "project"
    ],
    "toolName": "clip_results__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ClipResultsController.findOne",
    "path": "/clip-results/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "clip_results__find_one"
  },
  {
    "bodyFields": [
      "captionSrt",
      "captionedVideoS3Key",
      "captionedVideoUrl",
      "isDeleted",
      "isSelected",
      "mode",
      "providerJobId",
      "providerName",
      "readiness",
      "status",
      "summary",
      "terminalAt",
      "thumbnailUrl",
      "title",
      "videoS3Key",
      "videoUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ClipResultsController.update",
    "path": "/clip-results/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "clip_results__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentDraftsController.bulkApprove",
    "path": "/content-drafts/bulk-approve",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_drafts__bulk_approve"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentDraftsController.listDrafts",
    "path": "/brands/{brandId}/content-drafts",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "content_drafts__list_drafts"
  },
  {
    "bodyFields": [
      "content",
      "reason",
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ContentDraftsController.updateDraft",
    "path": "/content-drafts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "content_drafts__update_draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "put",
    "operationId": "ContentEngineController.approveDraft",
    "path": "/brands/{brandId}/content/queue/{draftId}/approve",
    "pathParams": [
      "draftId"
    ],
    "queryParams": [],
    "toolName": "content_engine__approve_draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentEngineController.bulkApproveDrafts",
    "path": "/brands/{brandId}/content/queue/bulk-approve",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_engine__bulk_approve_drafts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ContentEngineController.deletePlan",
    "path": "/brands/{brandId}/content/plans/{planId}",
    "pathParams": [
      "planId"
    ],
    "queryParams": [],
    "toolName": "content_engine__delete_plan"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentEngineController.executeItem",
    "path": "/brands/{brandId}/content/plans/{planId}/items/{itemId}/execute",
    "pathParams": [
      "brandId",
      "itemId"
    ],
    "queryParams": [],
    "toolName": "content_engine__execute_item"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentEngineController.executePlan",
    "path": "/brands/{brandId}/content/plans/{planId}/execute",
    "pathParams": [
      "brandId",
      "planId"
    ],
    "queryParams": [],
    "toolName": "content_engine__execute_plan"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentEngineController.generatePlan",
    "path": "/brands/{brandId}/content/plans",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_engine__generate_plan"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentEngineController.getPlan",
    "path": "/brands/{brandId}/content/plans/{planId}",
    "pathParams": [
      "planId"
    ],
    "queryParams": [],
    "toolName": "content_engine__get_plan"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentEngineController.getQueue",
    "path": "/brands/{brandId}/content/queue",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_engine__get_queue"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentEngineController.listPlans",
    "path": "/brands/{brandId}/content/plans",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_engine__list_plans"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "put",
    "operationId": "ContentEngineController.rejectDraft",
    "path": "/brands/{brandId}/content/queue/{draftId}/reject",
    "pathParams": [
      "draftId"
    ],
    "queryParams": [],
    "toolName": "content_engine__reject_draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "put",
    "operationId": "ContentEngineController.updatePlan",
    "path": "/brands/{brandId}/content/plans/{planId}",
    "pathParams": [
      "planId"
    ],
    "queryParams": [],
    "toolName": "content_engine__update_plan"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentGatewayController.executeSkill",
    "path": "/content-gateway/execute",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_gateway__execute_skill"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentGatewayController.routeSignal",
    "path": "/content-gateway/signal",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_gateway__route_signal"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentMentionsController.getMentions",
    "path": "/content/mentions",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_mentions__get_mentions"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentOptimizationController.autoApplySuggestion",
    "path": "/brands/{brandId}/optimization/suggestions/auto-apply",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_optimization__auto_apply_suggestion"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentOptimizationController.getAnalysis",
    "path": "/brands/{brandId}/optimization/analysis",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "endDate",
      "startDate",
      "topN"
    ],
    "toolName": "content_optimization__get_analysis"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentOptimizationController.getRecommendations",
    "path": "/brands/{brandId}/optimization/recommendations",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_optimization__get_recommendations"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentOptimizationController.getSuggestions",
    "path": "/brands/{brandId}/optimization/suggestions",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_optimization__get_suggestions"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentOptimizationController.optimizePrompt",
    "path": "/brands/{brandId}/optimization/optimize-prompt",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_optimization__optimize_prompt"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentOptimizationController.triggerOptimization",
    "path": "/brands/{brandId}/optimization/trigger",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_optimization__trigger_optimization"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentOrchestrationController.batchGenerate",
    "path": "/personas/{personaId}/pipeline/batch-generate",
    "pathParams": [
      "personaId"
    ],
    "queryParams": [],
    "toolName": "content_orchestration__batch_generate"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentOrchestrationController.generateAndPublish",
    "path": "/personas/{personaId}/pipeline/generate-and-publish",
    "pathParams": [
      "personaId"
    ],
    "queryParams": [],
    "toolName": "content_orchestration__generate_and_publish"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentOrchestrationController.getPipelineStatus",
    "path": "/personas/{personaId}/pipeline/status",
    "pathParams": [
      "personaId"
    ],
    "queryParams": [],
    "toolName": "content_orchestration__get_pipeline_status"
  },
  {
    "bodyFields": [
      "brand",
      "clicks",
      "comments",
      "contentType",
      "cycleNumber",
      "engagementRate",
      "externalPostId",
      "generationId",
      "hookUsed",
      "likes",
      "measuredAt",
      "performanceScore",
      "platform",
      "post",
      "promptUsed",
      "revenue",
      "saves",
      "shares",
      "source",
      "views",
      "workflowExecutionId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentPerformanceController.create",
    "path": "/content-performance",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_performance__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ContentPerformanceController.delete",
    "path": "/content-performance/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "content_performance__delete"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentPerformanceController.findOne",
    "path": "/content-performance/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "content_performance__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentPerformanceController.getAggregated",
    "path": "/content-performance/aggregate/{generationId}",
    "pathParams": [
      "generationId"
    ],
    "queryParams": [],
    "toolName": "content_performance__get_aggregated"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentPerformanceController.getAttribution",
    "path": "/content-performance/attribution/{generationId}",
    "pathParams": [
      "generationId"
    ],
    "queryParams": [],
    "toolName": "content_performance__get_attribution"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentPerformanceController.getStrategyRanking",
    "path": "/content-performance/attribution/ranking",
    "pathParams": [],
    "queryParams": [
      "brand",
      "limit"
    ],
    "toolName": "content_performance__get_strategy_ranking"
  },
  {
    "bodyFields": [
      "brandId",
      "entries"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentPerformanceController.importCsv",
    "path": "/content-performance/import/csv",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_performance__import_csv"
  },
  {
    "bodyFields": [
      "comments",
      "externalPostId",
      "likes",
      "notes",
      "platform",
      "postId",
      "revenue",
      "saves",
      "shares",
      "views"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentPerformanceController.importManual",
    "path": "/content-performance/import/manual",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_performance__import_manual"
  },
  {
    "bodyFields": [
      "brand",
      "entries"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentPerformanceController.manualImport",
    "path": "/content-performance/manual-import",
    "pathParams": [],
    "queryParams": [],
    "toolName": "content_performance__manual_import"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentPerformanceController.query",
    "path": "/content-performance",
    "pathParams": [],
    "queryParams": [
      "brand",
      "cycleNumber",
      "endDate",
      "generationId",
      "limit",
      "platform",
      "startDate"
    ],
    "toolName": "content_performance__query"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentRunsController.analyzeRunRecommendations",
    "path": "/content-runs/{id}/recommendations",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "content_runs__analyze_run_recommendations"
  },
  {
    "bodyFields": [
      "angle",
      "audience",
      "authorHandle",
      "callToAction",
      "channelFit",
      "confidence",
      "contentType",
      "evidence",
      "hypothesis",
      "matchedTrends",
      "metrics",
      "platform",
      "risk",
      "sourceContentId",
      "sourceReferenceId",
      "sourceUrl",
      "text",
      "title",
      "trendId",
      "trendTopic"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentRunsController.createBriefRun",
    "path": "/brands/{brandId}/content-runs/briefs",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_runs__create_brief_run"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ContentRunsController.createRemixPack",
    "path": "/content-runs/{id}/remix-pack",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "content_runs__create_remix_pack"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentRunsController.getRun",
    "path": "/content-runs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "content_runs__get_run"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentRunsController.listBrandRuns",
    "path": "/brands/{brandId}/content-runs",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "skillSlug",
      "status"
    ],
    "toolName": "content_runs__list_brand_runs"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContentSchedulesController.create",
    "path": "/brands/{brandId}/schedules",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "content_schedules__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentSchedulesController.getOne",
    "path": "/brands/{brandId}/schedules/{id}",
    "pathParams": [
      "brandId",
      "id"
    ],
    "queryParams": [],
    "toolName": "content_schedules__get_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContentSchedulesController.list",
    "path": "/brands/{brandId}/schedules",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "content_schedules__list"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ContentSchedulesController.remove",
    "path": "/brands/{brandId}/schedules/{id}",
    "pathParams": [
      "brandId",
      "id"
    ],
    "queryParams": [],
    "toolName": "content_schedules__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ContentSchedulesController.update",
    "path": "/brands/{brandId}/schedules/{id}",
    "pathParams": [
      "brandId",
      "id"
    ],
    "queryParams": [],
    "toolName": "content_schedules__update"
  },
  {
    "bodyFields": [
      "content",
      "metadata",
      "relevanceWeight"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContextsController.addEntry",
    "path": "/contexts/{contextId}/entries",
    "pathParams": [
      "contextId"
    ],
    "queryParams": [],
    "toolName": "contexts__add_entry"
  },
  {
    "bodyFields": [
      "brandId",
      "dateRange",
      "description",
      "includeAnalytics",
      "includePosts",
      "label",
      "platform"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContextsController.autoCreateFromAccount",
    "path": "/contexts/autocreate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "contexts__auto_create_from_account"
  },
  {
    "bodyFields": [
      "description",
      "label",
      "lastAnalyzed",
      "source",
      "sourceBrand",
      "sourceUrl",
      "type"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContextsController.create",
    "path": "/contexts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "contexts__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContextsController.enhancePrompt",
    "path": "/contexts/enhance",
    "pathParams": [],
    "queryParams": [],
    "toolName": "contexts__enhance_prompt"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContextsController.findAll",
    "path": "/contexts",
    "pathParams": [],
    "queryParams": [
      "category",
      "isActive",
      "search"
    ],
    "toolName": "contexts__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContextsController.findOne",
    "path": "/contexts/{contextId}",
    "pathParams": [
      "contextId"
    ],
    "queryParams": [],
    "toolName": "contexts__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ContextsController.getStats",
    "path": "/contexts/{contextId}/stats",
    "pathParams": [
      "contextId"
    ],
    "queryParams": [],
    "toolName": "contexts__get_stats"
  },
  {
    "bodyFields": [
      "contextBaseId",
      "limit",
      "minRelevance",
      "query"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ContextsController.queryContext",
    "path": "/contexts/query",
    "pathParams": [],
    "queryParams": [],
    "toolName": "contexts__query_context"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ContextsController.remove",
    "path": "/contexts/{contextId}",
    "pathParams": [
      "contextId"
    ],
    "queryParams": [],
    "toolName": "contexts__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ContextsController.removeEntry",
    "path": "/contexts/{contextId}/entries/{entryId}",
    "pathParams": [
      "contextId",
      "entryId"
    ],
    "queryParams": [],
    "toolName": "contexts__remove_entry"
  },
  {
    "bodyFields": [
      "description",
      "label",
      "lastAnalyzed",
      "source",
      "sourceBrand",
      "sourceUrl",
      "type"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ContextsController.update",
    "path": "/contexts/{contextId}",
    "pathParams": [
      "contextId"
    ],
    "queryParams": [],
    "toolName": "contexts__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CreativePatternsController.findAll",
    "path": "/creative-patterns",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "limit",
      "platform",
      "scope",
      "top"
    ],
    "toolName": "creative_patterns__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "CreatorsController.analyze",
    "path": "/content-intelligence/creators/{id}/analyze",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "creators__analyze"
  },
  {
    "bodyFields": [
      "displayName",
      "handle",
      "niche",
      "platform",
      "profileUrl",
      "scrapeConfig",
      "tags"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "CreatorsController.create",
    "path": "/content-intelligence/creators",
    "pathParams": [],
    "queryParams": [],
    "toolName": "creators__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CreatorsController.findAll",
    "path": "/content-intelligence/creators",
    "pathParams": [],
    "queryParams": [
      "limit",
      "niche",
      "page",
      "platform",
      "tags"
    ],
    "toolName": "creators__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CreatorsController.findOne",
    "path": "/content-intelligence/creators/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "creators__find_one"
  },
  {
    "bodyFields": [
      "creators",
      "format"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "CreatorsController.importCreators",
    "path": "/content-intelligence/creators/import",
    "pathParams": [],
    "queryParams": [],
    "toolName": "creators__import_creators"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "CreatorsController.remove",
    "path": "/content-intelligence/creators/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "creators__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "CreatorsController.rescrape",
    "path": "/content-intelligence/creators/{id}/rescrape",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "creators__rescrape"
  },
  {
    "bodyFields": [
      "signals",
      "thresholds"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "CredentialsController.assessAccountHealth",
    "path": "/credentials/{credentialId}/account-health/assess",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__assess_account_health"
  },
  {
    "bodyFields": [
      "backgroundColor",
      "category",
      "description",
      "key",
      "label",
      "textColor"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "CredentialsController.createCredentialTag",
    "path": "/credentials/{credentialId}/tags",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__create_credential_tag"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CredentialsController.findAll",
    "path": "/credentials",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "credentials__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CredentialsController.findAllInstagramPages",
    "path": "/credentials/{credentialId}/instagram/pages",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__find_all_instagram_pages"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CredentialsController.findOne",
    "path": "/credentials/{credentialId}",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CredentialsController.getMentions",
    "path": "/credentials/mentions",
    "pathParams": [],
    "queryParams": [],
    "toolName": "credentials__get_mentions"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CredentialsController.getPublishingContext",
    "path": "/credentials/{credentialId}/publishing-context",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__get_publishing_context"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CredentialsController.getQuotaStatus",
    "path": "/credentials/{credentialId}/quota",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [
      "organizationId"
    ],
    "toolName": "credentials__get_quota_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CredentialsController.listBrandAccountHealth",
    "path": "/credentials/brand/{brandId}/account-health",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "credentials__list_brand_account_health"
  },
  {
    "bodyFields": [
      "confirm",
      "expiresAt",
      "reason"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "CredentialsController.overrideAccountHealth",
    "path": "/credentials/{credentialId}/account-health/override",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__override_account_health"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "CredentialsController.refreshCredentialToken",
    "path": "/credentials/{credentialId}/refresh",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__refresh_credential_token"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "CredentialsController.remove",
    "path": "/credentials/{credentialId}",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__remove"
  },
  {
    "bodyFields": [
      "accessToken",
      "accessTokenExpiry",
      "accessTokenSecret",
      "brand",
      "description",
      "externalAvatar",
      "externalHandle",
      "externalId",
      "externalName",
      "isConnected",
      "isDeleted",
      "label",
      "oauthState",
      "oauthToken",
      "oauthTokenSecret",
      "organization",
      "platform",
      "refreshToken",
      "refreshTokenExpiry",
      "tags",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "CredentialsController.update",
    "path": "/credentials/{credentialId}",
    "pathParams": [
      "credentialId"
    ],
    "queryParams": [],
    "toolName": "credentials__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CreditsController.getByokUsageSummary",
    "path": "/credits/byok-usage-summary",
    "pathParams": [],
    "queryParams": [],
    "toolName": "credits__get_byok_usage_summary"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CreditsController.getLastPurchaseBaseline",
    "path": "/credits/last-purchase-baseline",
    "pathParams": [],
    "queryParams": [],
    "toolName": "credits__get_last_purchase_baseline"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CreditsController.getTopbarBalances",
    "path": "/credits/topbar-balances",
    "pathParams": [],
    "queryParams": [],
    "toolName": "credits__get_topbar_balances"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CreditsController.getUsageMetrics",
    "path": "/credits/usage",
    "pathParams": [],
    "queryParams": [],
    "toolName": "credits__get_usage_metrics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CronJobsController.findAll",
    "path": "/cron-jobs",
    "pathParams": [],
    "queryParams": [],
    "toolName": "cron_jobs__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CronJobsController.runById",
    "path": "/cron-jobs/{id}/runs/{runId}",
    "pathParams": [
      "id",
      "runId"
    ],
    "queryParams": [],
    "toolName": "cron_jobs__run_by_id"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "CronJobsController.runs",
    "path": "/cron-jobs/{id}/runs",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "cron_jobs__runs"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "DashboardLayoutsController.findForPage",
    "path": "/dashboard-layouts",
    "pathParams": [],
    "queryParams": [
      "brand",
      "pageKey"
    ],
    "toolName": "dashboard_layouts__find_for_page"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "DashboardLayoutsController.remove",
    "path": "/dashboard-layouts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "dashboard_layouts__remove"
  },
  {
    "bodyFields": [
      "brandId",
      "document",
      "pageKey",
      "version"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "put",
    "operationId": "DashboardLayoutsController.upsert",
    "path": "/dashboard-layouts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "dashboard_layouts__upsert"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "DesktopSyncController.confirmAssetUpload",
    "path": "/sync/desktop/assets/{id}/uploaded",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "desktop_sync__confirm_asset_upload"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "DesktopSyncController.getBrandManifest",
    "path": "/sync/desktop/brand-manifest",
    "pathParams": [],
    "queryParams": [],
    "toolName": "desktop_sync__get_brand_manifest"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "DesktopSyncController.pullThreads",
    "path": "/sync/desktop/threads",
    "pathParams": [],
    "queryParams": [
      "cursor",
      "limit",
      "messageLimit"
    ],
    "toolName": "desktop_sync__pull_threads"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "DesktopSyncController.pushAssets",
    "path": "/sync/desktop/assets/metadata",
    "pathParams": [],
    "queryParams": [],
    "toolName": "desktop_sync__push_assets"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "DesktopSyncController.pushOps",
    "path": "/sync/desktop/ops",
    "pathParams": [],
    "queryParams": [],
    "toolName": "desktop_sync__push_ops"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "DesktopSyncController.pushThreads",
    "path": "/sync/desktop/threads",
    "pathParams": [],
    "queryParams": [],
    "toolName": "desktop_sync__push_threads"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "DesktopSyncController.requestAssetUpload",
    "path": "/sync/desktop/assets/upload-url",
    "pathParams": [],
    "queryParams": [],
    "toolName": "desktop_sync__request_asset_upload"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "DesktopSyncController.uploadAsset",
    "path": "/sync/desktop/assets/{id}/upload",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "desktop_sync__upload_asset"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "DevtoController.connect",
    "path": "/services/devto/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "devto__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "DevtoController.publishArticle",
    "path": "/services/devto/publish/{articleId}",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [
      "brandId",
      "canonicalUrl",
      "published",
      "tags"
    ],
    "toolName": "devto__publish_article"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "DiscordController.connect",
    "path": "/services/discord/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "discord__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "DiscordController.verify",
    "path": "/services/discord/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "discord__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "DistributionsController.cancel",
    "path": "/distributions/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "distributions__cancel"
  },
  {
    "bodyFields": [
      "brandId",
      "caption",
      "chatId",
      "contentType",
      "mediaUrl",
      "platform",
      "scheduledAt",
      "text"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "DistributionsController.create",
    "path": "/distributions",
    "pathParams": [],
    "queryParams": [],
    "toolName": "distributions__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "DistributionsController.findOne",
    "path": "/distributions/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "distributions__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "DistributionsController.list",
    "path": "/distributions",
    "pathParams": [],
    "queryParams": [
      "limit",
      "page",
      "platform",
      "status"
    ],
    "toolName": "distributions__list"
  },
  {
    "bodyFields": [
      "_id",
      "name",
      "organization",
      "settings",
      "sourceVideoId",
      "totalDurationFrames",
      "tracks",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "EditorProjectsController.create",
    "path": "/editor-projects",
    "pathParams": [],
    "queryParams": [],
    "toolName": "editor_projects__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "EditorProjectsController.findAll",
    "path": "/editor-projects",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "editor_projects__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "EditorProjectsController.findOne",
    "path": "/editor-projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "editor_projects__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "EditorProjectsController.remove",
    "path": "/editor-projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "editor_projects__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "EditorProjectsController.render",
    "path": "/editor-projects/{id}/render",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "editor_projects__render"
  },
  {
    "bodyFields": [
      "_id",
      "isDeleted",
      "name",
      "organization",
      "settings",
      "sourceVideoId",
      "status",
      "thumbnailUrl",
      "totalDurationFrames",
      "tracks",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "EditorProjectsController.update",
    "path": "/editor-projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "editor_projects__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsController.findAllElements",
    "path": "/elements",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements__find_all_elements"
  },
  {
    "bodyFields": [
      "category",
      "description",
      "isDefault",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsBlacklistsController.create",
    "path": "/elements/blacklists",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_blacklists__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsBlacklistsController.findAll",
    "path": "/elements/blacklists",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_blacklists__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsBlacklistsController.findOne",
    "path": "/elements/blacklists/{blacklistId}",
    "pathParams": [
      "blacklistId"
    ],
    "queryParams": [],
    "toolName": "elements_blacklists__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsBlacklistsController.patch",
    "path": "/elements/blacklists/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_blacklists__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsBlacklistsController.remove",
    "path": "/elements/blacklists/{blacklistId}",
    "pathParams": [
      "blacklistId"
    ],
    "queryParams": [],
    "toolName": "elements_blacklists__remove"
  },
  {
    "bodyFields": [
      "category",
      "description",
      "isDefault",
      "isDeleted",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsBlacklistsController.update",
    "path": "/elements/blacklists/{blacklistId}",
    "pathParams": [
      "blacklistId"
    ],
    "queryParams": [],
    "toolName": "elements_blacklists__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsCameraMovementsController.create",
    "path": "/elements/camera-movements",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_camera_movements__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsCameraMovementsController.findAll",
    "path": "/elements/camera-movements",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_camera_movements__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsCameraMovementsController.findOne",
    "path": "/elements/camera-movements/{cameraMovementId}",
    "pathParams": [
      "cameraMovementId"
    ],
    "queryParams": [],
    "toolName": "elements_camera_movements__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsCameraMovementsController.patch",
    "path": "/elements/camera-movements/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_camera_movements__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsCameraMovementsController.remove",
    "path": "/elements/camera-movements/{cameraMovementId}",
    "pathParams": [
      "cameraMovementId"
    ],
    "queryParams": [],
    "toolName": "elements_camera_movements__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsCameraMovementsController.update",
    "path": "/elements/camera-movements/{cameraMovementId}",
    "pathParams": [
      "cameraMovementId"
    ],
    "queryParams": [],
    "toolName": "elements_camera_movements__update"
  },
  {
    "bodyFields": [
      "description",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsCamerasController.create",
    "path": "/elements/cameras",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_cameras__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsCamerasController.findAll",
    "path": "/elements/cameras",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_cameras__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsCamerasController.findOne",
    "path": "/elements/cameras/{cameraId}",
    "pathParams": [
      "cameraId"
    ],
    "queryParams": [],
    "toolName": "elements_cameras__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsCamerasController.patch",
    "path": "/elements/cameras/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_cameras__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsCamerasController.remove",
    "path": "/elements/cameras/{cameraId}",
    "pathParams": [
      "cameraId"
    ],
    "queryParams": [],
    "toolName": "elements_cameras__remove"
  },
  {
    "bodyFields": [
      "description",
      "isDeleted",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsCamerasController.update",
    "path": "/elements/cameras/{cameraId}",
    "pathParams": [
      "cameraId"
    ],
    "queryParams": [],
    "toolName": "elements_cameras__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsLensesController.create",
    "path": "/elements/lenses",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_lenses__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsLensesController.findAll",
    "path": "/elements/lenses",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_lenses__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsLensesController.findOne",
    "path": "/elements/lenses/{lensId}",
    "pathParams": [
      "lensId"
    ],
    "queryParams": [],
    "toolName": "elements_lenses__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsLensesController.patch",
    "path": "/elements/lenses/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_lenses__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsLensesController.remove",
    "path": "/elements/lenses/{lensId}",
    "pathParams": [
      "lensId"
    ],
    "queryParams": [],
    "toolName": "elements_lenses__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsLensesController.update",
    "path": "/elements/lenses/{lensId}",
    "pathParams": [
      "lensId"
    ],
    "queryParams": [],
    "toolName": "elements_lenses__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsLightingsController.create",
    "path": "/elements/lightings",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_lightings__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsLightingsController.findAll",
    "path": "/elements/lightings",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_lightings__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsLightingsController.findOne",
    "path": "/elements/lightings/{lightingId}",
    "pathParams": [
      "lightingId"
    ],
    "queryParams": [],
    "toolName": "elements_lightings__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsLightingsController.patch",
    "path": "/elements/lightings/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_lightings__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsLightingsController.remove",
    "path": "/elements/lightings/{lightingId}",
    "pathParams": [
      "lightingId"
    ],
    "queryParams": [],
    "toolName": "elements_lightings__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsLightingsController.update",
    "path": "/elements/lightings/{lightingId}",
    "pathParams": [
      "lightingId"
    ],
    "queryParams": [],
    "toolName": "elements_lightings__update"
  },
  {
    "bodyFields": [
      "description",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsMoodsController.create",
    "path": "/elements/moods",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_moods__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsMoodsController.findAll",
    "path": "/elements/moods",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_moods__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsMoodsController.findOne",
    "path": "/elements/moods/{moodId}",
    "pathParams": [
      "moodId"
    ],
    "queryParams": [],
    "toolName": "elements_moods__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsMoodsController.patch",
    "path": "/elements/moods/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_moods__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsMoodsController.remove",
    "path": "/elements/moods/{moodId}",
    "pathParams": [
      "moodId"
    ],
    "queryParams": [],
    "toolName": "elements_moods__remove"
  },
  {
    "bodyFields": [
      "description",
      "isDeleted",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsMoodsController.update",
    "path": "/elements/moods/{moodId}",
    "pathParams": [
      "moodId"
    ],
    "queryParams": [],
    "toolName": "elements_moods__update"
  },
  {
    "bodyFields": [
      "description",
      "isFavorite",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsScenesController.create",
    "path": "/elements/scenes",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_scenes__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsScenesController.findAll",
    "path": "/elements/scenes",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_scenes__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsScenesController.findOne",
    "path": "/elements/scenes/{sceneId}",
    "pathParams": [
      "sceneId"
    ],
    "queryParams": [],
    "toolName": "elements_scenes__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsScenesController.patch",
    "path": "/elements/scenes/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_scenes__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsScenesController.remove",
    "path": "/elements/scenes/{sceneId}",
    "pathParams": [
      "sceneId"
    ],
    "queryParams": [],
    "toolName": "elements_scenes__remove"
  },
  {
    "bodyFields": [
      "description",
      "isFavorite",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsScenesController.update",
    "path": "/elements/scenes/{sceneId}",
    "pathParams": [
      "sceneId"
    ],
    "queryParams": [],
    "toolName": "elements_scenes__update"
  },
  {
    "bodyFields": [
      "category",
      "description",
      "isActive",
      "isDefault",
      "isDeleted",
      "key",
      "label",
      "organization"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsSoundsController.create",
    "path": "/elements/sounds",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_sounds__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsSoundsController.findAll",
    "path": "/elements/sounds",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_sounds__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsSoundsController.findOne",
    "path": "/elements/sounds/{soundId}",
    "pathParams": [
      "soundId"
    ],
    "queryParams": [],
    "toolName": "elements_sounds__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsSoundsController.patch",
    "path": "/elements/sounds/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_sounds__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsSoundsController.remove",
    "path": "/elements/sounds/{soundId}",
    "pathParams": [
      "soundId"
    ],
    "queryParams": [],
    "toolName": "elements_sounds__remove"
  },
  {
    "bodyFields": [
      "category",
      "description",
      "isActive",
      "isDefault",
      "isDeleted",
      "key",
      "label",
      "organization"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsSoundsController.update",
    "path": "/elements/sounds/{soundId}",
    "pathParams": [
      "soundId"
    ],
    "queryParams": [],
    "toolName": "elements_sounds__update"
  },
  {
    "bodyFields": [
      "description",
      "key",
      "label",
      "model",
      "models"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ElementsStylesController.create",
    "path": "/elements/styles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_styles__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsStylesController.findAll",
    "path": "/elements/styles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "elements_styles__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ElementsStylesController.findOne",
    "path": "/elements/styles/{styleId}",
    "pathParams": [
      "styleId"
    ],
    "queryParams": [],
    "toolName": "elements_styles__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ElementsStylesController.patch",
    "path": "/elements/styles/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "elements_styles__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ElementsStylesController.remove",
    "path": "/elements/styles/{styleId}",
    "pathParams": [
      "styleId"
    ],
    "queryParams": [],
    "toolName": "elements_styles__remove"
  },
  {
    "bodyFields": [
      "description",
      "isDeleted",
      "key",
      "label",
      "model",
      "models"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ElementsStylesController.update",
    "path": "/elements/styles/{styleId}",
    "pathParams": [
      "styleId"
    ],
    "queryParams": [],
    "toolName": "elements_styles__update"
  },
  {
    "bodyFields": [
      "evaluationIds",
      "includeIncomplete"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "EvaluationsController.compareEvaluations",
    "path": "/evaluations/compare",
    "pathParams": [],
    "queryParams": [],
    "toolName": "evaluations__compare_evaluations"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "EvaluationsController.create",
    "path": "/evaluations",
    "pathParams": [],
    "queryParams": [],
    "toolName": "evaluations__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "EvaluationsController.deleteEvaluation",
    "path": "/evaluations/{evaluationId}",
    "pathParams": [
      "evaluationId"
    ],
    "queryParams": [],
    "toolName": "evaluations__delete_evaluation"
  },
  {
    "bodyFields": [
      "contentId",
      "contentType",
      "evaluationType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "EvaluationsController.evaluateArticle",
    "path": "/evaluations/articles/{articleId}",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "evaluations__evaluate_article"
  },
  {
    "bodyFields": [
      "platform",
      "url"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "EvaluationsController.evaluateExternal",
    "path": "/evaluations/external",
    "pathParams": [],
    "queryParams": [],
    "toolName": "evaluations__evaluate_external"
  },
  {
    "bodyFields": [
      "contentId",
      "contentType",
      "evaluationType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "EvaluationsController.evaluateImage",
    "path": "/evaluations/images/{imageId}",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "evaluations__evaluate_image"
  },
  {
    "bodyFields": [
      "contentId",
      "contentType",
      "evaluationType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "EvaluationsController.evaluatePost",
    "path": "/evaluations/posts/{postId}",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "evaluations__evaluate_post"
  },
  {
    "bodyFields": [
      "contentId",
      "contentType",
      "evaluationType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "EvaluationsController.evaluateVideo",
    "path": "/evaluations/videos/{videoId}",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "evaluations__evaluate_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "EvaluationsController.findAll",
    "path": "/evaluations",
    "pathParams": [],
    "queryParams": [],
    "toolName": "evaluations__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "EvaluationsController.findOne",
    "path": "/evaluations/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "evaluations__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "EvaluationsController.getTrends",
    "path": "/evaluations/analytics/trends",
    "pathParams": [],
    "queryParams": [
      "brand",
      "contentType",
      "endDate",
      "evaluationType",
      "maxScore",
      "minScore",
      "startDate"
    ],
    "toolName": "evaluations__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "EvaluationsController.patch",
    "path": "/evaluations/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "evaluations__patch"
  },
  {
    "bodyFields": [
      "comment",
      "decision",
      "reviewerScore",
      "tags"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "EvaluationsController.recordReviewerFeedback",
    "path": "/evaluations/{evaluationId}/review",
    "pathParams": [
      "evaluationId"
    ],
    "queryParams": [],
    "toolName": "evaluations__record_reviewer_feedback"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "EvaluationsController.remove",
    "path": "/evaluations/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "evaluations__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "FacebookController.connect",
    "path": "/services/facebook/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "facebook__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "FacebookController.createPost",
    "path": "/services/facebook/post",
    "pathParams": [],
    "queryParams": [],
    "toolName": "facebook__create_post"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "FacebookController.getPostAnalytics",
    "path": "/services/facebook/{facebookId}/analytics",
    "pathParams": [
      "facebookId"
    ],
    "queryParams": [
      "accessToken"
    ],
    "toolName": "facebook__get_post_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "FacebookController.getUserPages",
    "path": "/services/facebook/pages",
    "pathParams": [],
    "queryParams": [],
    "toolName": "facebook__get_user_pages"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "FacebookController.schedulePost",
    "path": "/services/facebook/schedule",
    "pathParams": [],
    "queryParams": [],
    "toolName": "facebook__schedule_post"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "FacebookController.verify",
    "path": "/services/facebook/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "facebook__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "FoldersController.create",
    "path": "/folders",
    "pathParams": [],
    "queryParams": [],
    "toolName": "folders__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "FoldersController.findAll",
    "path": "/folders",
    "pathParams": [],
    "queryParams": [],
    "toolName": "folders__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "FoldersController.findOne",
    "path": "/folders/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "folders__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "FoldersController.patch",
    "path": "/folders/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "folders__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "FoldersController.remove",
    "path": "/folders/{folderId}",
    "pathParams": [
      "folderId"
    ],
    "queryParams": [],
    "toolName": "folders__remove"
  },
  {
    "bodyFields": [
      "brand",
      "description",
      "isActive",
      "label",
      "tags"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "FoldersController.update",
    "path": "/folders/{folderId}",
    "pathParams": [
      "folderId"
    ],
    "queryParams": [],
    "toolName": "folders__update"
  },
  {
    "bodyFields": [
      "description",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "FontFamiliesController.create",
    "path": "/font-families",
    "pathParams": [],
    "queryParams": [],
    "toolName": "font_families__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "FontFamiliesController.findAll",
    "path": "/font-families",
    "pathParams": [],
    "queryParams": [],
    "toolName": "font_families__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "FontFamiliesController.findOne",
    "path": "/font-families/{fontFamilyId}",
    "pathParams": [
      "fontFamilyId"
    ],
    "queryParams": [],
    "toolName": "font_families__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "FontFamiliesController.patch",
    "path": "/font-families/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "font_families__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "FontFamiliesController.remove",
    "path": "/font-families/{fontFamilyId}",
    "pathParams": [
      "fontFamilyId"
    ],
    "queryParams": [],
    "toolName": "font_families__remove"
  },
  {
    "bodyFields": [
      "description",
      "isDeleted",
      "key",
      "label",
      "model"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "FontFamiliesController.update",
    "path": "/font-families/{fontFamilyId}",
    "pathParams": [
      "fontFamilyId"
    ],
    "queryParams": [],
    "toolName": "font_families__update"
  },
  {
    "bodyFields": [
      "additionalContext",
      "brandId",
      "hashtags",
      "patternId",
      "patternType",
      "platform",
      "playbookId",
      "templateCategory",
      "topic",
      "variationsCount"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "GenerateController.generate",
    "path": "/content-intelligence/generate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "generate__generate"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "GhostController.connect",
    "path": "/services/ghost/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "ghost__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "GhostController.createPost",
    "path": "/services/ghost/posts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "ghost__create_post"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GifsController.findAll",
    "path": "/gifs",
    "pathParams": [],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "scope",
      "search",
      "sort",
      "status"
    ],
    "toolName": "gifs__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GifsController.findOne",
    "path": "/gifs/{gifId}",
    "pathParams": [
      "gifId"
    ],
    "queryParams": [],
    "toolName": "gifs__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "GifsController.remove",
    "path": "/gifs/{gifId}",
    "pathParams": [
      "gifId"
    ],
    "queryParams": [],
    "toolName": "gifs__remove"
  },
  {
    "bodyFields": [
      "description",
      "level",
      "parentId",
      "status",
      "title"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "GoalsController.create",
    "path": "/goals",
    "pathParams": [],
    "queryParams": [],
    "toolName": "goals__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoalsController.findAll",
    "path": "/goals",
    "pathParams": [],
    "queryParams": [],
    "toolName": "goals__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoalsController.findOne",
    "path": "/goals/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "goals__find_one"
  },
  {
    "bodyFields": [
      "description",
      "isDeleted",
      "level",
      "parentId",
      "status",
      "title"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "GoalsController.patch",
    "path": "/goals/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "goals__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "GoalsController.remove",
    "path": "/goals/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "goals__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "GoogleAdsController.connect",
    "path": "/services/google-ads/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "google_ads__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleAdsController.getAdGroupInsights",
    "path": "/services/google-ads/ad-groups/{id}/insights",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "customerId",
      "endDate",
      "loginCustomerId",
      "startDate"
    ],
    "toolName": "google_ads__get_ad_group_insights"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleAdsController.getCampaignMetrics",
    "path": "/services/google-ads/campaigns/{id}/metrics",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "customerId",
      "endDate",
      "loginCustomerId",
      "segmentByDate",
      "startDate"
    ],
    "toolName": "google_ads__get_campaign_metrics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleAdsController.getKeywordPerformance",
    "path": "/services/google-ads/keywords",
    "pathParams": [],
    "queryParams": [
      "customerId",
      "endDate",
      "limit",
      "loginCustomerId",
      "startDate"
    ],
    "toolName": "google_ads__get_keyword_performance"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleAdsController.getSearchTerms",
    "path": "/services/google-ads/search-terms/{campaignId}",
    "pathParams": [
      "campaignId"
    ],
    "queryParams": [
      "customerId",
      "endDate",
      "limit",
      "loginCustomerId",
      "startDate"
    ],
    "toolName": "google_ads__get_search_terms"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleAdsController.listCampaigns",
    "path": "/services/google-ads/campaigns",
    "pathParams": [],
    "queryParams": [
      "customerId",
      "limit",
      "loginCustomerId",
      "status"
    ],
    "toolName": "google_ads__list_campaigns"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleAdsController.listCustomers",
    "path": "/services/google-ads/customers",
    "pathParams": [],
    "queryParams": [],
    "toolName": "google_ads__list_customers"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "GoogleAdsController.verify",
    "path": "/services/google-ads/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "google_ads__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "GoogleSearchConsoleController.connect",
    "path": "/services/google-search-console/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "google_search_console__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleSearchConsoleController.getSearchAnalytics",
    "path": "/services/google-search-console/search-analytics",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "endDate",
      "rowLimit",
      "siteUrl",
      "startDate",
      "startRow"
    ],
    "toolName": "google_search_console__get_search_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "GoogleSearchConsoleController.listSites",
    "path": "/services/google-search-console/sites",
    "pathParams": [],
    "queryParams": [
      "brandId"
    ],
    "toolName": "google_search_console__list_sites"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "GoogleSearchConsoleController.verify",
    "path": "/services/google-search-console/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "google_search_console__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "HarnessProfilesController.create",
    "path": "/harness-profiles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "harness_profiles__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HarnessProfilesController.findForBrand",
    "path": "/harness-profiles",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "isActive"
    ],
    "toolName": "harness_profiles__find_for_brand"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "HarnessProfilesController.remove",
    "path": "/harness-profiles/{profileId}",
    "pathParams": [
      "profileId"
    ],
    "queryParams": [],
    "toolName": "harness_profiles__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "HarnessProfilesController.update",
    "path": "/harness-profiles/{profileId}",
    "pathParams": [
      "profileId"
    ],
    "queryParams": [],
    "toolName": "harness_profiles__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HedraController.getAvatars",
    "path": "/hedra/avatars",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hedra__get_avatars"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HedraController.getJobStatus",
    "path": "/hedra/jobs/{jobId}",
    "pathParams": [
      "jobId"
    ],
    "queryParams": [],
    "toolName": "hedra__get_job_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HedraController.getStatus",
    "path": "/hedra/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hedra__get_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HedraController.getVoices",
    "path": "/hedra/voices",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hedra__get_voices"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HeyGenController.getAvatars",
    "path": "/heygen/avatars",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hey_gen__get_avatars"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HeyGenController.getStatus",
    "path": "/heygen/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hey_gen__get_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HeyGenController.getVoices",
    "path": "/heygen/voices",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hey_gen__get_voices"
  },
  {
    "bodyFields": [
      "brandId",
      "ctaIngredientId",
      "hookDurationSeconds",
      "labelPrefix",
      "youtubeUrls"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "HookRemixController.createBatchHookRemix",
    "path": "/hook-remix/batch",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hook_remix__create_batch_hook_remix"
  },
  {
    "bodyFields": [
      "brandId",
      "ctaIngredientId",
      "description",
      "hookDurationSeconds",
      "label",
      "youtubeUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "HookRemixController.createHookRemix",
    "path": "/hook-remix",
    "pathParams": [],
    "queryParams": [],
    "toolName": "hook_remix__create_hook_remix"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "HookRemixController.getJob",
    "path": "/hook-remix/{jobId}",
    "pathParams": [
      "jobId"
    ],
    "queryParams": [],
    "toolName": "hook_remix__get_job"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ImagesController.findAll",
    "path": "/images",
    "pathParams": [],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "isPublic",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "references",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "images__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ImagesController.findOne",
    "path": "/images/{imageId}",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "images__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ImagesController.remove",
    "path": "/images/{imageId}",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "images__remove"
  },
  {
    "bodyFields": [
      "autoSelectModel",
      "blacklist",
      "brand",
      "brandingMode",
      "camera",
      "category",
      "contentRating",
      "folder",
      "fontFamily",
      "format",
      "groupId",
      "groupIndex",
      "height",
      "isBrandingEnabled",
      "isDefault",
      "isHighlighted",
      "lens",
      "lighting",
      "metadata",
      "metadataId",
      "model",
      "mood",
      "order",
      "outputs",
      "parent",
      "prioritize",
      "prompt",
      "promptTemplate",
      "qualityFeedback",
      "qualityScore",
      "qualityStatus",
      "references",
      "reviewStatus",
      "scene",
      "scope",
      "seed",
      "sources",
      "speech",
      "status",
      "style",
      "tags",
      "text",
      "training",
      "transformations",
      "useTemplate",
      "version",
      "waitForCompletion",
      "width"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ImagesOperationsController.create",
    "path": "/images",
    "pathParams": [],
    "queryParams": [],
    "toolName": "images_operations__create"
  },
  {
    "bodyFields": [
      "borderInset",
      "gridCols",
      "gridRows"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ImagesOperationsController.splitContactSheet",
    "path": "/images/{id}/split",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "images_operations__split_contact_sheet"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ImagesRelationshipsController.findChildren",
    "path": "/images/{imageId}/children",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "isPublic",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "references",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "images_relationships__find_children"
  },
  {
    "bodyFields": [
      "autoSelectModel",
      "blacklist",
      "brand",
      "brandingMode",
      "camera",
      "category",
      "contentRating",
      "folder",
      "fontFamily",
      "format",
      "groupId",
      "groupIndex",
      "height",
      "isBrandingEnabled",
      "isDefault",
      "isHighlighted",
      "lens",
      "lighting",
      "metadata",
      "metadataId",
      "model",
      "mood",
      "order",
      "outputs",
      "parent",
      "prioritize",
      "prompt",
      "promptTemplate",
      "qualityFeedback",
      "qualityScore",
      "qualityStatus",
      "references",
      "reviewStatus",
      "scene",
      "scope",
      "seed",
      "sources",
      "speech",
      "status",
      "style",
      "tags",
      "text",
      "training",
      "transformations",
      "useTemplate",
      "version",
      "waitForCompletion",
      "width"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ImagesTransformationsController.reframeImage",
    "path": "/images/{imageId}/reframe",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "images_transformations__reframe_image"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ImagesTransformationsController.resizeImage",
    "path": "/images/{imageId}/resize",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "images_transformations__resize_image"
  },
  {
    "bodyFields": [
      "brand",
      "enhanceModel",
      "faceEnhancement",
      "faceEnhancementCreativity",
      "faceEnhancementStrength",
      "model",
      "organization",
      "outputFormat",
      "outputs",
      "subjectDetection",
      "upscaleFactor"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ImagesTransformationsController.upscaleImage",
    "path": "/images/{imageId}/upscale",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "images_transformations__upscale_image"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ImagesUploadsController.confirmUpload",
    "path": "/images/upload/confirm/{imageId}",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "images_uploads__confirm_upload"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ImagesUploadsController.generatePresignedUrl",
    "path": "/images/upload/presigned",
    "pathParams": [],
    "queryParams": [],
    "toolName": "images_uploads__generate_presigned_url"
  },
  {
    "bodyFields": [
      "category"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ImagesUploadsController.upload",
    "path": "/images/upload",
    "pathParams": [],
    "queryParams": [],
    "toolName": "images_uploads__upload"
  },
  {
    "bodyFields": [
      "address"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ImagesUploadsController.uploadNFT",
    "path": "/images/upload/nft",
    "pathParams": [],
    "queryParams": [],
    "toolName": "images_uploads__upload_nft"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "IngredientsController.getBatch",
    "path": "/ingredients/batch",
    "pathParams": [],
    "queryParams": [
      "ids"
    ],
    "toolName": "ingredients__get_batch"
  },
  {
    "bodyFields": [
      "brand",
      "category",
      "cdnUrl",
      "contentRating",
      "folder",
      "generationCompletedAt",
      "generationError",
      "generationProgress",
      "generationSource",
      "generationStage",
      "groupId",
      "groupIndex",
      "isDefault",
      "isDeleted",
      "isFavorite",
      "isHighlighted",
      "metadata",
      "metadataId",
      "modelUsed",
      "order",
      "parent",
      "prompt",
      "qualityFeedback",
      "qualityScore",
      "qualityStatus",
      "references",
      "reviewStatus",
      "s3Key",
      "scope",
      "seed",
      "sources",
      "status",
      "tags",
      "text",
      "training",
      "transformations",
      "version"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "IngredientsController.update",
    "path": "/ingredients/{ingredientId}",
    "pathParams": [
      "ingredientId"
    ],
    "queryParams": [],
    "toolName": "ingredients__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "IngredientsRelationshipsController.findChildren",
    "path": "/ingredients/{ingredientId}/children",
    "pathParams": [
      "ingredientId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "ingredients_relationships__find_children"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "IngredientsRelationshipsController.findMetadata",
    "path": "/ingredients/{ingredientId}/metadata",
    "pathParams": [
      "ingredientId"
    ],
    "queryParams": [],
    "toolName": "ingredients_relationships__find_metadata"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "IngredientsRelationshipsController.findPosts",
    "path": "/ingredients/{ingredientId}/posts",
    "pathParams": [
      "ingredientId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "ingredients_relationships__find_posts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "InsightsController.getBestTimes",
    "path": "/insights/times",
    "pathParams": [],
    "queryParams": [
      "platform",
      "timezone"
    ],
    "toolName": "insights__get_best_times"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "InsightsController.getContentGaps",
    "path": "/insights/gaps",
    "pathParams": [],
    "queryParams": [],
    "toolName": "insights__get_content_gaps"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "InsightsController.getForecast",
    "path": "/insights/forecast",
    "pathParams": [],
    "queryParams": [],
    "toolName": "insights__get_forecast"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "InsightsController.getGrowthPrediction",
    "path": "/insights/growth",
    "pathParams": [],
    "queryParams": [
      "platform"
    ],
    "toolName": "insights__get_growth_prediction"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "InsightsController.getInsights",
    "path": "/insights",
    "pathParams": [],
    "queryParams": [
      "limit"
    ],
    "toolName": "insights__get_insights"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "InsightsController.predictViral",
    "path": "/insights/viral",
    "pathParams": [],
    "queryParams": [],
    "toolName": "insights__predict_viral"
  },
  {
    "bodyFields": [
      "isDismissed",
      "isRead"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "InsightsController.updateInsight",
    "path": "/insights/{insightId}",
    "pathParams": [
      "insightId"
    ],
    "queryParams": [],
    "toolName": "insights__update_insight"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "InstagramController.connect",
    "path": "/services/instagram/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "instagram__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "InstagramController.getTrends",
    "path": "/services/instagram/trends",
    "pathParams": [],
    "queryParams": [],
    "toolName": "instagram__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "InstagramController.verify",
    "path": "/services/instagram/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "instagram__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "InvitationsController.acceptInvitationRedirect",
    "path": "/accept-invitation",
    "pathParams": [],
    "queryParams": [],
    "toolName": "invitations__accept_invitation_redirect"
  },
  {
    "bodyFields": [
      "brandId",
      "channel",
      "description",
      "productName",
      "url",
      "variationsCount"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "LaunchCopyController.generate",
    "path": "/launch-copy/generate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "launch_copy__generate"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "LinkedInController.connect",
    "path": "/services/linkedin/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "linked_in__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "LinkedInController.verify",
    "path": "/services/linkedin/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "linked_in__verify"
  },
  {
    "bodyFields": [
      "brand",
      "category",
      "label",
      "url"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "LinksController.create",
    "path": "/links",
    "pathParams": [],
    "queryParams": [],
    "toolName": "links__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "LinksController.findAll",
    "path": "/links",
    "pathParams": [],
    "queryParams": [],
    "toolName": "links__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "LinksController.findOne",
    "path": "/links/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "links__find_one"
  },
  {
    "bodyFields": [
      "brand",
      "category",
      "isDeleted",
      "label",
      "url"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "LinksController.patch",
    "path": "/links/{linkId}",
    "pathParams": [
      "linkId"
    ],
    "queryParams": [],
    "toolName": "links__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "LinksController.remove",
    "path": "/links/{linkId}",
    "pathParams": [
      "linkId"
    ],
    "queryParams": [],
    "toolName": "links__remove"
  },
  {
    "bodyFields": [
      "credits",
      "input",
      "model",
      "operation",
      "provider"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ManagedInferenceController.execute",
    "path": "/managed-inference",
    "pathParams": [],
    "queryParams": [],
    "toolName": "managed_inference__execute"
  },
  {
    "bodyFields": [
      "cancelUrl",
      "email",
      "firstName",
      "lastName",
      "quantity",
      "stripePriceId",
      "successUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ManagedStripeController.createCheckout",
    "path": "/services/stripe/managed/checkout",
    "pathParams": [],
    "queryParams": [],
    "toolName": "managed_stripe__create_checkout"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ManagedStripeController.getCheckoutResult",
    "path": "/services/stripe/managed/sessions/{sessionId}",
    "pathParams": [
      "sessionId"
    ],
    "queryParams": [],
    "toolName": "managed_stripe__get_checkout_result"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MarketplaceInstallController.install",
    "path": "/marketplace-installs/{listingId}",
    "pathParams": [
      "listingId"
    ],
    "queryParams": [],
    "toolName": "marketplace_install__install"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MastodonController.exchangeToken",
    "path": "/services/mastodon/token",
    "pathParams": [],
    "queryParams": [],
    "toolName": "mastodon__exchange_token"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MastodonController.getAuthUrl",
    "path": "/services/mastodon/auth",
    "pathParams": [],
    "queryParams": [
      "clientId",
      "instanceUrl",
      "redirectUri",
      "state"
    ],
    "toolName": "mastodon__get_auth_url"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MastodonController.registerApp",
    "path": "/services/mastodon/register",
    "pathParams": [],
    "queryParams": [],
    "toolName": "mastodon__register_app"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MastodonController.verifyCredentials",
    "path": "/services/mastodon/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "mastodon__verify_credentials"
  },
  {
    "bodyFields": [
      "result"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "McpApprovalsController.attachResult",
    "path": "/mcp-approvals/{id}/result",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "mcp_approvals__attach_result"
  },
  {
    "bodyFields": [
      "arguments",
      "toolName"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "McpApprovalsController.create",
    "path": "/mcp-approvals",
    "pathParams": [],
    "queryParams": [],
    "toolName": "mcp_approvals__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "McpApprovalsController.findAll",
    "path": "/mcp-approvals",
    "pathParams": [],
    "queryParams": [
      "status"
    ],
    "toolName": "mcp_approvals__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "McpApprovalsController.findOne",
    "path": "/mcp-approvals/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "mcp_approvals__find_one"
  },
  {
    "bodyFields": [
      "decision",
      "result"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "McpApprovalsController.resolve",
    "path": "/mcp-approvals/{id}/resolve",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "mcp_approvals__resolve"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MediumController.connect",
    "path": "/services/medium/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "medium__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MediumController.publishArticle",
    "path": "/services/medium/publish/{articleId}",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [
      "brandId",
      "publishStatus"
    ],
    "toolName": "medium__publish_article"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MediumController.verify",
    "path": "/services/medium/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "medium__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MembersController.findAll",
    "path": "/members",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "members__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MembersController.findOne",
    "path": "/members/{memberId}",
    "pathParams": [
      "memberId"
    ],
    "queryParams": [],
    "toolName": "members__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MembersController.listInvitations",
    "path": "/members/invitations",
    "pathParams": [],
    "queryParams": [
      "status"
    ],
    "toolName": "members__list_invitations"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MembersController.resendInvitation",
    "path": "/members/invitations/{invitationId}/resend",
    "pathParams": [
      "invitationId"
    ],
    "queryParams": [],
    "toolName": "members__resend_invitation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "MembersController.revokeInvitation",
    "path": "/members/invitations/{invitationId}",
    "pathParams": [
      "invitationId"
    ],
    "queryParams": [],
    "toolName": "members__revoke_invitation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.compareCampaigns",
    "path": "/services/meta-ads/campaigns/compare",
    "pathParams": [],
    "queryParams": [
      "campaignIds"
    ],
    "toolName": "meta_ads__compare_campaigns"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsController.createAd",
    "path": "/services/meta-ads/ads",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads__create_ad"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsController.createAdSet",
    "path": "/services/meta-ads/adsets",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads__create_ad_set"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsController.createCampaign",
    "path": "/services/meta-ads/campaigns",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads__create_campaign"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "MetaAdsController.deleteAd",
    "path": "/services/meta-ads/ads/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads__delete_ad"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.getAdAccounts",
    "path": "/services/meta-ads/accounts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads__get_ad_accounts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.getAdCreatives",
    "path": "/services/meta-ads/creatives",
    "pathParams": [],
    "queryParams": [
      "adAccountId",
      "limit"
    ],
    "toolName": "meta_ads__get_ad_creatives"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.getAdInsights",
    "path": "/services/meta-ads/ads/{id}/insights",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "since",
      "until"
    ],
    "toolName": "meta_ads__get_ad_insights"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.getAdSetInsights",
    "path": "/services/meta-ads/adsets/{id}/insights",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "since",
      "until"
    ],
    "toolName": "meta_ads__get_ad_set_insights"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.getCampaignInsights",
    "path": "/services/meta-ads/campaigns/{id}/insights",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "since",
      "until"
    ],
    "toolName": "meta_ads__get_campaign_insights"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.getTopPerformers",
    "path": "/services/meta-ads/top-performers",
    "pathParams": [],
    "queryParams": [
      "adAccountId",
      "limit",
      "metric"
    ],
    "toolName": "meta_ads__get_top_performers"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsController.listCampaigns",
    "path": "/services/meta-ads/campaigns",
    "pathParams": [],
    "queryParams": [
      "adAccountId",
      "limit",
      "status"
    ],
    "toolName": "meta_ads__list_campaigns"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsController.pauseAd",
    "path": "/services/meta-ads/ads/{id}/pause",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads__pause_ad"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "MetaAdsController.updateAdSet",
    "path": "/services/meta-ads/adsets/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads__update_ad_set"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "MetaAdsController.updateCampaign",
    "path": "/services/meta-ads/campaigns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads__update_campaign"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsController.uploadAdImage",
    "path": "/services/meta-ads/media/image",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads__upload_ad_image"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsController.uploadAdVideo",
    "path": "/services/meta-ads/media/video",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads__upload_ad_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsBulkController.createBulkUpload",
    "path": "/services/meta-ads/bulk/upload",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads_bulk__create_bulk_upload"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsBulkController.getJobStatus",
    "path": "/services/meta-ads/bulk/jobs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads_bulk__get_job_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsBulkController.listJobs",
    "path": "/services/meta-ads/bulk/jobs",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset"
    ],
    "toolName": "meta_ads_bulk__list_jobs"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "MetaAdsBulkController.updateJob",
    "path": "/services/meta-ads/bulk/jobs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads_bulk__update_job"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MetaAdsOptimizationController.executeRecommendation",
    "path": "/services/meta-ads/optimization/recommendations/{id}/execute",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads_optimization__execute_recommendation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsOptimizationController.getConfig",
    "path": "/services/meta-ads/optimization/config",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads_optimization__get_config"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsOptimizationController.listAuditLogs",
    "path": "/services/meta-ads/optimization/audit-logs",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset"
    ],
    "toolName": "meta_ads_optimization__list_audit_logs"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MetaAdsOptimizationController.listRecommendations",
    "path": "/services/meta-ads/optimization/recommendations",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset"
    ],
    "toolName": "meta_ads_optimization__list_recommendations"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "MetaAdsOptimizationController.updateConfig",
    "path": "/services/meta-ads/optimization/config",
    "pathParams": [],
    "queryParams": [],
    "toolName": "meta_ads_optimization__update_config"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "MetaAdsOptimizationController.updateRecommendation",
    "path": "/services/meta-ads/optimization/recommendations/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "meta_ads_optimization__update_recommendation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ModelsController.create",
    "path": "/models",
    "pathParams": [],
    "queryParams": [],
    "toolName": "models__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ModelsController.findAll",
    "path": "/models",
    "pathParams": [],
    "queryParams": [
      "brand",
      "category",
      "isActive",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "organizationId",
      "page",
      "pagination",
      "registryStatus",
      "sort"
    ],
    "toolName": "models__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ModelsController.findOne",
    "path": "/models/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "models__find_one"
  },
  {
    "bodyFields": [
      "category",
      "cost",
      "description",
      "isActive",
      "isDefault",
      "isDeleted",
      "isDiscovered",
      "isHighlighted",
      "isLegacy",
      "isPublic",
      "key",
      "label",
      "margin",
      "organization",
      "parentModel",
      "provider",
      "providerConfig",
      "reason",
      "reviewStatus",
      "succeededBy",
      "training"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ModelsController.patch",
    "path": "/models/{modelId}",
    "pathParams": [
      "modelId"
    ],
    "queryParams": [],
    "toolName": "models__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ModelsController.remove",
    "path": "/models/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "models__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MonitoredAccountsController.create",
    "path": "/monitored-accounts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "monitored_accounts__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MonitoredAccountsController.findAll",
    "path": "/monitored-accounts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "monitored_accounts__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MonitoredAccountsController.findOne",
    "path": "/monitored-accounts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "monitored_accounts__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "MonitoredAccountsController.patch",
    "path": "/monitored-accounts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "monitored_accounts__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "MonitoredAccountsController.remove",
    "path": "/monitored-accounts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "monitored_accounts__remove"
  },
  {
    "bodyFields": [
      "username"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "MonitoredAccountsController.validateTwitterUsername",
    "path": "/monitored-accounts/validate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "monitored_accounts__validate_twitter_username"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MoodBoardsController.findByBrand",
    "path": "/mood-boards",
    "pathParams": [],
    "queryParams": [
      "brand"
    ],
    "toolName": "mood_boards__find_by_brand"
  },
  {
    "bodyFields": [
      "brandId",
      "layout",
      "metadata"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "MoodBoardsController.update",
    "path": "/mood-boards/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "mood_boards__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MusicsController.findAll",
    "path": "/musics",
    "pathParams": [],
    "queryParams": [],
    "toolName": "musics__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "MusicsController.findOne",
    "path": "/musics/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "musics__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "MusicsController.patch",
    "path": "/musics/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "musics__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "MusicsController.remove",
    "path": "/musics/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "musics__remove"
  },
  {
    "bodyFields": [
      "autoSelectModel",
      "brand",
      "category",
      "classifierFreeGuidance",
      "contentRating",
      "duration",
      "folder",
      "groupId",
      "groupIndex",
      "isDefault",
      "isHighlighted",
      "metadata",
      "metadataId",
      "model",
      "modelVersion",
      "order",
      "outputs",
      "parent",
      "prioritize",
      "prompt",
      "qualityFeedback",
      "qualityScore",
      "qualityStatus",
      "references",
      "reviewStatus",
      "scope",
      "seed",
      "sources",
      "status",
      "tags",
      "temperature",
      "text",
      "topK",
      "topP",
      "training",
      "transformations",
      "version",
      "waitForCompletion"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "MusicsOperationsController.create",
    "path": "/musics",
    "pathParams": [],
    "queryParams": [],
    "toolName": "musics_operations__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "MusicsUploadController.createUpload",
    "path": "/musics/upload",
    "pathParams": [],
    "queryParams": [],
    "toolName": "musics_upload__create_upload"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "NewslettersController.approve",
    "path": "/newsletters/{id}/approve",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "newsletters__approve"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "NewslettersController.context",
    "path": "/newsletters/{id}/context",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "newsletters__context"
  },
  {
    "bodyFields": [
      "angle",
      "content",
      "contextNewsletterIds",
      "generationPrompt",
      "label",
      "scheduledFor",
      "sourceRefs",
      "status",
      "summary",
      "topic"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "NewslettersController.create",
    "path": "/newsletters",
    "pathParams": [],
    "queryParams": [],
    "toolName": "newsletters__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "NewslettersController.findAll",
    "path": "/newsletters",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "search",
      "sort",
      "status"
    ],
    "toolName": "newsletters__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "NewslettersController.findOne",
    "path": "/newsletters/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "newsletters__find_one"
  },
  {
    "bodyFields": [
      "angle",
      "contextNewsletterIds",
      "instructions",
      "newsletterId",
      "sourceRefs",
      "topic"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "NewslettersController.generateDraft",
    "path": "/newsletters/generate-draft",
    "pathParams": [],
    "queryParams": [],
    "toolName": "newsletters__generate_draft"
  },
  {
    "bodyFields": [
      "angle",
      "content",
      "contextNewsletterIds",
      "generationPrompt",
      "label",
      "scheduledFor",
      "sourceRefs",
      "status",
      "summary",
      "topic"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "NewslettersController.patch",
    "path": "/newsletters/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "newsletters__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "NewslettersController.publish",
    "path": "/newsletters/{id}/publish",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "newsletters__publish"
  },
  {
    "bodyFields": [
      "count",
      "instructions"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "NewslettersController.topicProposals",
    "path": "/newsletters/topic-proposals",
    "pathParams": [],
    "queryParams": [],
    "toolName": "newsletters__topic_proposals"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OnboardingController.checkPrefixAvailable",
    "path": "/onboarding/prefix/{prefix}/available",
    "pathParams": [
      "prefix"
    ],
    "queryParams": [],
    "toolName": "onboarding__check_prefix_available"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OnboardingController.claimProactiveWorkspace",
    "path": "/onboarding/proactive-claim",
    "pathParams": [],
    "queryParams": [],
    "toolName": "onboarding__claim_proactive_workspace"
  },
  {
    "bodyFields": [
      "brandId",
      "contentType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OnboardingController.generatePreview",
    "path": "/onboarding/generate-preview",
    "pathParams": [],
    "queryParams": [],
    "toolName": "onboarding__generate_preview"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OnboardingController.getInstallReadiness",
    "path": "/onboarding/install-readiness",
    "pathParams": [],
    "queryParams": [],
    "toolName": "onboarding__get_install_readiness"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OnboardingController.getProactiveWorkspace",
    "path": "/onboarding/proactive-workspace",
    "pathParams": [],
    "queryParams": [],
    "toolName": "onboarding__get_proactive_workspace"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OnboardingController.getStatus",
    "path": "/onboarding/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "onboarding__get_status"
  },
  {
    "bodyFields": [
      "prefix"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OnboardingController.setPrefix",
    "path": "/onboarding/prefix",
    "pathParams": [],
    "queryParams": [],
    "toolName": "onboarding__set_prefix"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OpenAiOAuthController.connect",
    "path": "/services/openai/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "open_ai_o_auth__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OpenAiOAuthController.verify",
    "path": "/services/openai/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "open_ai_o_auth__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OptimizersController.analyzeContent",
    "path": "/optimizers/analyze",
    "pathParams": [],
    "queryParams": [],
    "toolName": "optimizers__analyze_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OptimizersController.generatePrompts",
    "path": "/optimizers/prompts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "optimizers__generate_prompts"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OptimizersController.generateVariants",
    "path": "/optimizers/variants",
    "pathParams": [],
    "queryParams": [],
    "toolName": "optimizers__generate_variants"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OptimizersController.getBestPostingTimes",
    "path": "/optimizers/times",
    "pathParams": [],
    "queryParams": [
      "platform",
      "timezone"
    ],
    "toolName": "optimizers__get_best_posting_times"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OptimizersController.getOptimizationHistory",
    "path": "/optimizers/history",
    "pathParams": [],
    "queryParams": [
      "limit"
    ],
    "toolName": "optimizers__get_optimization_history"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OptimizersController.optimizeContent",
    "path": "/optimizers/optimize",
    "pathParams": [],
    "queryParams": [],
    "toolName": "optimizers__optimize_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OptimizersController.suggestHashtags",
    "path": "/optimizers/hashtags",
    "pathParams": [],
    "queryParams": [],
    "toolName": "optimizers__suggest_hashtags"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OpusProController.generateVideo",
    "path": "/opuspro/generate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "opus_pro__generate_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OpusProController.getStatus",
    "path": "/opuspro/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "opus_pro__get_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OpusProController.getTemplates",
    "path": "/opuspro/templates",
    "pathParams": [],
    "queryParams": [],
    "toolName": "opus_pro__get_templates"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OpusProController.getVideoStatus",
    "path": "/opuspro/status/{videoId}",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "opus_pro__get_video_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OrganizationsController.create",
    "path": "/organizations",
    "pathParams": [],
    "queryParams": [],
    "toolName": "organizations__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OrganizationsController.createOrganization",
    "path": "/organizations/create",
    "pathParams": [],
    "queryParams": [],
    "toolName": "organizations__create_organization"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsController.findAll",
    "path": "/organizations",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "organizations__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsController.findBySlug",
    "path": "/organizations/by-slug/{slug}",
    "pathParams": [
      "slug"
    ],
    "queryParams": [],
    "toolName": "organizations__find_by_slug"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsController.findMine",
    "path": "/organizations/mine",
    "pathParams": [],
    "queryParams": [],
    "toolName": "organizations__find_mine"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsController.findOne",
    "path": "/organizations/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "organizations__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "OrganizationsController.patch",
    "path": "/organizations/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "organizations__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "OrganizationsController.remove",
    "path": "/organizations/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "organizations__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OrganizationsController.switchOrganization",
    "path": "/organizations/switch/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "organizations__switch_organization"
  },
  {
    "bodyFields": [
      "platform"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OrganizationsIntegrationsController.create",
    "path": "/organizations/{organizationId}/integrations",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_integrations__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsIntegrationsController.findAll",
    "path": "/organizations/{organizationId}/integrations",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_integrations__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsIntegrationsController.findOne",
    "path": "/organizations/{organizationId}/integrations/{id}",
    "pathParams": [
      "id",
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_integrations__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "OrganizationsIntegrationsController.remove",
    "path": "/organizations/{organizationId}/integrations/{id}",
    "pathParams": [
      "id",
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_integrations__remove"
  },
  {
    "bodyFields": [
      "platform"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "OrganizationsIntegrationsController.update",
    "path": "/organizations/{organizationId}/integrations/{id}",
    "pathParams": [
      "id",
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_integrations__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsMembersController.findAllMembers",
    "path": "/organizations/{organizationId}/members",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "organizations_members__find_all_members"
  },
  {
    "bodyFields": [
      "email",
      "firstName",
      "lastName",
      "role"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OrganizationsMembersController.inviteMember",
    "path": "/organizations/{organizationId}/members",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_members__invite_member"
  },
  {
    "bodyFields": [
      "authProviderMembershipId",
      "brands",
      "isActive",
      "isDeleted",
      "organization",
      "role",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "OrganizationsMembersController.updateMember",
    "path": "/organizations/{organizationId}/members/{memberId}",
    "pathParams": [
      "memberId",
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_members__update_member"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAllActivities",
    "path": "/organizations/{organizationId}/activities",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "organizations_relationships__find_all_activities"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAllBrands",
    "path": "/organizations/{organizationId}/brands",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "organizations_relationships__find_all_brands"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAllIngredients",
    "path": "/organizations/{organizationId}/ingredients",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brand",
      "category",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "search",
      "sort",
      "status"
    ],
    "toolName": "organizations_relationships__find_all_ingredients"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAllPosts",
    "path": "/organizations/{organizationId}/posts",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brand",
      "credential",
      "endDate",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "platform",
      "sort",
      "startDate",
      "status"
    ],
    "toolName": "organizations_relationships__find_all_posts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAllTags",
    "path": "/organizations/{organizationId}/tags",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "organizations_relationships__find_all_tags"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAllVideos",
    "path": "/organizations/{organizationId}/videos",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "reference",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "organizations_relationships__find_all_videos"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAnalytics",
    "path": "/organizations/{organizationId}/analytics",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "startDate"
    ],
    "toolName": "organizations_relationships__find_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAnalyticsPlatforms",
    "path": "/organizations/{organizationId}/analytics/platforms",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "startDate"
    ],
    "toolName": "organizations_relationships__find_analytics_platforms"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAnalyticsTimeSeries",
    "path": "/organizations/{organizationId}/analytics/timeseries",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "groupBy",
      "startDate"
    ],
    "toolName": "organizations_relationships__find_analytics_time_series"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findAnalyticsTopContent",
    "path": "/organizations/{organizationId}/analytics/top-content",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "limit",
      "metric",
      "startDate"
    ],
    "toolName": "organizations_relationships__find_analytics_top_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsRelationshipsController.findPlatformAnalytics",
    "path": "/organizations/{organizationId}/platforms/{platform}/analytics",
    "pathParams": [
      "organizationId",
      "platform"
    ],
    "queryParams": [
      "brandId",
      "endDate",
      "startDate"
    ],
    "toolName": "organizations_relationships__find_platform_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsSettingsController.findOneSubscription",
    "path": "/organizations/{organizationId}/subscription",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__find_one_subscription"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsSettingsController.getByokAllProviders",
    "path": "/organizations/{organizationId}/settings/byok",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__get_byok_all_providers"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsSettingsController.getByokProviderStatus",
    "path": "/organizations/{organizationId}/settings/byok/{provider}",
    "pathParams": [
      "organizationId",
      "provider"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__get_byok_provider_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsSettingsController.getDarkroomCapabilities",
    "path": "/organizations/{organizationId}/brands/{brandId}/darkroom-capabilities",
    "pathParams": [
      "brandId",
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__get_darkroom_capabilities"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OrganizationsSettingsController.getSettings",
    "path": "/organizations/{organizationId}/settings",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__get_settings"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "OrganizationsSettingsController.removeByokProviderKey",
    "path": "/organizations/{organizationId}/settings/byok/{provider}",
    "pathParams": [
      "organizationId",
      "provider"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__remove_byok_provider_key"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "put",
    "operationId": "OrganizationsSettingsController.saveByokProviderKey",
    "path": "/organizations/{organizationId}/settings/byok/{provider}",
    "pathParams": [
      "organizationId",
      "provider"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__save_byok_provider_key"
  },
  {
    "bodyFields": [
      "event"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OrganizationsSettingsController.testWebhookDelivery",
    "path": "/organizations/{organizationId}/settings/webhooks/test",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__test_webhook_delivery"
  },
  {
    "bodyFields": [
      "agentPolicy",
      "agentReplyStyle",
      "brandsLimit",
      "byokOpenrouterApiKey",
      "defaultAvatarIngredientId",
      "defaultAvatarPhotoUrl",
      "defaultImageModel",
      "defaultImageToVideoModel",
      "defaultModel",
      "defaultModelReview",
      "defaultModelUpdate",
      "defaultMusicModel",
      "defaultVideoModel",
      "defaultVoiceId",
      "defaultVoiceProvider",
      "defaultVoiceRef",
      "enabledModels",
      "isAdvancedMode",
      "isAutoEvaluateEnabled",
      "isByokEnabled",
      "isDarkroomNsfwVisible",
      "isDeleted",
      "isFastlaneEnabled",
      "isFirstLogin",
      "isGenerateArticlesEnabled",
      "isGenerateImagesEnabled",
      "isGenerateMusicEnabled",
      "isGenerateVideosEnabled",
      "isNotificationsDiscordEnabled",
      "isNotificationsEmailEnabled",
      "isVerifyIngredientEnabled",
      "isVerifyScriptEnabled",
      "isVerifyVideoEnabled",
      "isVoiceControlEnabled",
      "isWatermarkEnabled",
      "isWebhookEnabled",
      "isWhitelabelEnabled",
      "onboardingJourneyCompletedAt",
      "onboardingJourneyMissions",
      "organization",
      "seatsLimit",
      "subscriptionTier",
      "timezone",
      "webhookEndpoint",
      "webhookEventTypes",
      "webhookSecret"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "OrganizationsSettingsController.updateSettings",
    "path": "/organizations/{organizationId}/settings",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__update_settings"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OrganizationsSettingsController.validateByokProviderKey",
    "path": "/organizations/{organizationId}/settings/byok/{provider}/validate",
    "pathParams": [
      "organizationId",
      "provider"
    ],
    "queryParams": [],
    "toolName": "organizations_settings__validate_byok_provider_key"
  },
  {
    "bodyFields": [
      "targetType",
      "urls",
      "usernames"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OutreachCampaignsController.addTargets",
    "path": "/outreach-campaigns/{id}/targets",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__add_targets"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OutreachCampaignsController.completeCampaign",
    "path": "/outreach-campaigns/{id}/complete",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__complete_campaign"
  },
  {
    "bodyFields": [
      "aiConfig",
      "brand",
      "campaignType",
      "credential",
      "description",
      "discoveryConfig",
      "dmConfig",
      "isActive",
      "label",
      "organization",
      "platform",
      "rateLimits",
      "schedule",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "OutreachCampaignsController.create",
    "path": "/outreach-campaigns",
    "pathParams": [],
    "queryParams": [],
    "toolName": "outreach_campaigns__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OutreachCampaignsController.discoverTargets",
    "path": "/outreach-campaigns/{id}/targets/discover",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__discover_targets"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OutreachCampaignsController.findAll",
    "path": "/outreach-campaigns",
    "pathParams": [],
    "queryParams": [],
    "toolName": "outreach_campaigns__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OutreachCampaignsController.findOne",
    "path": "/outreach-campaigns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OutreachCampaignsController.getAnalytics",
    "path": "/outreach-campaigns/{id}/analytics",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__get_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "OutreachCampaignsController.getTargets",
    "path": "/outreach-campaigns/{id}/targets",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__get_targets"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OutreachCampaignsController.parseUrlEndpoint",
    "path": "/outreach-campaigns/parse-url",
    "pathParams": [],
    "queryParams": [],
    "toolName": "outreach_campaigns__parse_url_endpoint"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "OutreachCampaignsController.patch",
    "path": "/outreach-campaigns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OutreachCampaignsController.pauseCampaign",
    "path": "/outreach-campaigns/{id}/pause",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__pause_campaign"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OutreachCampaignsController.previewReply",
    "path": "/outreach-campaigns/{id}/targets/{targetId}/preview",
    "pathParams": [
      "id",
      "targetId"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__preview_reply"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "OutreachCampaignsController.remove",
    "path": "/outreach-campaigns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "OutreachCampaignsController.startCampaign",
    "path": "/outreach-campaigns/{id}/start",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "outreach_campaigns__start_campaign"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PatternsController.findAll",
    "path": "/content-intelligence/patterns",
    "pathParams": [],
    "queryParams": [
      "limit",
      "minEngagementRate",
      "minRelevanceWeight",
      "page",
      "patternType",
      "platform",
      "sortBy",
      "sortOrder",
      "sourceCreator",
      "tags",
      "templateCategory"
    ],
    "toolName": "patterns__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PatternsController.findOne",
    "path": "/content-intelligence/patterns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "patterns__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "PatternsController.remove",
    "path": "/content-intelligence/patterns/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "patterns__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PerformanceSummaryController.getGenerationContext",
    "path": "/content-performance/summary/generation-context",
    "pathParams": [],
    "queryParams": [
      "brandId"
    ],
    "toolName": "performance_summary__get_generation_context"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PerformanceSummaryController.getPromptPerformance",
    "path": "/content-performance/summary/prompt-performance",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "endDate",
      "startDate"
    ],
    "toolName": "performance_summary__get_prompt_performance"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PerformanceSummaryController.getTopPerformers",
    "path": "/content-performance/summary/top-performers",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "endDate",
      "limit",
      "startDate"
    ],
    "toolName": "performance_summary__get_top_performers"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PerformanceSummaryController.getWeeklySummary",
    "path": "/content-performance/summary/weekly",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "endDate",
      "startDate",
      "topN",
      "worstN"
    ],
    "toolName": "performance_summary__get_weekly_summary"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PersonasController.create",
    "path": "/personas",
    "pathParams": [],
    "queryParams": [],
    "toolName": "personas__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PersonasController.findAll",
    "path": "/personas",
    "pathParams": [],
    "queryParams": [],
    "toolName": "personas__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PersonasController.findOne",
    "path": "/personas/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas__find_one"
  },
  {
    "bodyFields": [
      "assignedMembers",
      "avatarExternalId",
      "avatarIngredientId",
      "avatarProvider",
      "contentStrategy",
      "credentials",
      "description",
      "handle",
      "isDeleted",
      "label",
      "memberIds",
      "profileImageUrl",
      "status",
      "tags",
      "voiceExternalId",
      "voiceIngredientId",
      "voiceProvider"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "PersonasController.patch",
    "path": "/personas/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "PersonasController.remove",
    "path": "/personas/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PersonasContentController.generateCaption",
    "path": "/personas/{id}/generate/caption",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas_content__generate_caption"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PersonasContentController.generateContentPlan",
    "path": "/personas/{id}/content-plan",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas_content__generate_content_plan"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PersonasContentController.generatePhoto",
    "path": "/personas/{id}/generate/photo",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas_content__generate_photo"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PersonasContentController.generateVideo",
    "path": "/personas/{id}/generate/video",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas_content__generate_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PersonasContentController.generateVoice",
    "path": "/personas/{id}/generate/voice",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas_content__generate_voice"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PersonasContentController.getPersonaPosts",
    "path": "/personas/{id}/posts",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "limit",
      "page"
    ],
    "toolName": "personas_content__get_persona_posts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PersonasContentController.publish",
    "path": "/personas/{id}/publish",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "personas_content__publish"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PinterestController.createPin",
    "path": "/services/pinterest/pins",
    "pathParams": [],
    "queryParams": [],
    "toolName": "pinterest__create_pin"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PinterestController.exchangeToken",
    "path": "/services/pinterest/token",
    "pathParams": [],
    "queryParams": [],
    "toolName": "pinterest__exchange_token"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PinterestController.getAuthUrl",
    "path": "/services/pinterest/auth",
    "pathParams": [],
    "queryParams": [
      "state"
    ],
    "toolName": "pinterest__get_auth_url"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PinterestController.pinAnalytics",
    "path": "/services/pinterest/pins/{id}/analytics",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "accessToken"
    ],
    "toolName": "pinterest__pin_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PinterestController.search",
    "path": "/services/pinterest/search",
    "pathParams": [],
    "queryParams": [
      "accessToken",
      "query"
    ],
    "toolName": "pinterest__search"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PlaybooksController.buildInsights",
    "path": "/content-intelligence/playbooks/{id}/build",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "playbooks__build_insights"
  },
  {
    "bodyFields": [
      "description",
      "name",
      "niche",
      "platform",
      "sourceCreators"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PlaybooksController.create",
    "path": "/content-intelligence/playbooks",
    "pathParams": [],
    "queryParams": [],
    "toolName": "playbooks__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PlaybooksController.findAll",
    "path": "/content-intelligence/playbooks",
    "pathParams": [],
    "queryParams": [],
    "toolName": "playbooks__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PlaybooksController.findOne",
    "path": "/content-intelligence/playbooks/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "playbooks__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "PlaybooksController.remove",
    "path": "/content-intelligence/playbooks/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "playbooks__remove"
  },
  {
    "bodyFields": [
      "description",
      "name",
      "niche",
      "sourceCreators"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "PlaybooksController.update",
    "path": "/content-intelligence/playbooks/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "playbooks__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PostGroupsController.cancel",
    "path": "/post-groups/{id}/cancel",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "post_groups__cancel"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PostGroupsController.create",
    "path": "/post-groups",
    "pathParams": [],
    "queryParams": [],
    "toolName": "post_groups__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PostGroupsController.getOne",
    "path": "/post-groups/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "post_groups__get_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PostGroupsController.pause",
    "path": "/post-groups/{id}/pause",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "post_groups__pause"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PostGroupsController.publishNow",
    "path": "/post-groups/{id}/publish-now",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "post_groups__publish_now"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PostGroupsController.resume",
    "path": "/post-groups/{id}/resume",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "post_groups__resume"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "PostGroupsController.update",
    "path": "/post-groups/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "post_groups__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "PostGroupsController.updateTarget",
    "path": "/post-groups/{id}/targets/{targetId}",
    "pathParams": [
      "id",
      "targetId"
    ],
    "queryParams": [],
    "toolName": "post_groups__update_target"
  },
  {
    "bodyFields": [
      "campaign",
      "category",
      "contentRunId",
      "creativeVersion",
      "credential",
      "description",
      "externalId",
      "externalShortcode",
      "groupId",
      "hookVersion",
      "ingredients",
      "isAnalyticsEnabled",
      "isRepeat",
      "isShareToFeedSelected",
      "label",
      "maxRepeats",
      "order",
      "parent",
      "personaId",
      "publicationDate",
      "publishIntent",
      "quoteTweetId",
      "repeatDaysOfWeek",
      "repeatEndDate",
      "repeatFrequency",
      "repeatInterval",
      "scheduleSlot",
      "scheduledDate",
      "source",
      "status",
      "tags",
      "threadPosts",
      "timezone",
      "variantId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsController.create",
    "path": "/posts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "posts__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PostsController.findAll",
    "path": "/posts",
    "pathParams": [],
    "queryParams": [
      "brand",
      "credential",
      "endDate",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "platform",
      "sort",
      "startDate",
      "status"
    ],
    "toolName": "posts__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PostsController.findOne",
    "path": "/posts/{postId}",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "posts__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "PostsController.patch",
    "path": "/posts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "posts__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "PostsController.remove",
    "path": "/posts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "posts__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PostsAnalyticsController.getAnalytics",
    "path": "/posts/{postId}/analytics",
    "pathParams": [
      "postId"
    ],
    "queryParams": [
      "endDate",
      "startDate"
    ],
    "toolName": "posts_analytics__get_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PostsAnalyticsController.refreshAllAnalytics",
    "path": "/posts/analytics",
    "pathParams": [],
    "queryParams": [],
    "toolName": "posts_analytics__refresh_all_analytics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PostsAnalyticsController.refreshAnalytics",
    "path": "/posts/{postId}/refresh-analytics",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "posts_analytics__refresh_analytics"
  },
  {
    "bodyFields": [
      "campaign",
      "category",
      "contentRunId",
      "creativeVersion",
      "credential",
      "description",
      "externalId",
      "externalShortcode",
      "groupId",
      "hookVersion",
      "ingredients",
      "isAnalyticsEnabled",
      "isRepeat",
      "isShareToFeedSelected",
      "label",
      "maxRepeats",
      "order",
      "parent",
      "personaId",
      "publicationDate",
      "publishIntent",
      "quoteTweetId",
      "repeatDaysOfWeek",
      "repeatEndDate",
      "repeatFrequency",
      "repeatInterval",
      "scheduleSlot",
      "scheduledDate",
      "source",
      "status",
      "tags",
      "threadPosts",
      "timezone",
      "variantId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsOperationsController.addThreadReply",
    "path": "/posts/{postId}/replies",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "posts_operations__add_thread_reply"
  },
  {
    "bodyFields": [
      "credential",
      "items"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "PostsOperationsController.batchUpdate",
    "path": "/posts/batch",
    "pathParams": [],
    "queryParams": [],
    "toolName": "posts_operations__batch_update"
  },
  {
    "bodyFields": [
      "description",
      "label"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsOperationsController.createRemixPost",
    "path": "/posts/{postId}/remixes",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "posts_operations__create_remix_post"
  },
  {
    "bodyFields": [
      "prompt",
      "tone"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsOperationsController.enhancePost",
    "path": "/posts/{postId}/enhancements",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "posts_operations__enhance_post"
  },
  {
    "bodyFields": [
      "count",
      "tone"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsOperationsController.expandToThread",
    "path": "/posts/{postId}/thread-expansions",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "posts_operations__expand_to_thread"
  },
  {
    "bodyFields": [
      "count",
      "credential",
      "format",
      "sourceReferenceIds",
      "sourceUrl",
      "tone",
      "topic",
      "trendId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsOperationsController.generateAccountContent",
    "path": "/posts/account-generations",
    "pathParams": [],
    "queryParams": [],
    "toolName": "posts_operations__generate_account_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsOperationsController.generateHookVariations",
    "path": "/posts/hook-generations",
    "pathParams": [],
    "queryParams": [],
    "toolName": "posts_operations__generate_hook_variations"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PostsOperationsController.scoreSeo",
    "path": "/posts/{postId}/seo-scores",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "posts_operations__score_seo"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PreflightController.getFeatureStatus",
    "path": "/preflight/{feature}",
    "pathParams": [
      "feature"
    ],
    "queryParams": [],
    "toolName": "preflight__get_feature_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PreflightController.getStatus",
    "path": "/preflight/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "preflight__get_status"
  },
  {
    "bodyFields": [
      "blacklists",
      "brand",
      "camera",
      "category",
      "description",
      "ingredient",
      "isActive",
      "key",
      "label",
      "model",
      "mood",
      "organization",
      "platform",
      "prompt",
      "scene",
      "style"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PresetsController.create",
    "path": "/presets",
    "pathParams": [],
    "queryParams": [],
    "toolName": "presets__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PresetsController.findAll",
    "path": "/presets",
    "pathParams": [],
    "queryParams": [],
    "toolName": "presets__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PresetsController.findOne",
    "path": "/presets/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "presets__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "PresetsController.patch",
    "path": "/presets/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "presets__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "PresetsController.remove",
    "path": "/presets/{presetId}",
    "pathParams": [
      "presetId"
    ],
    "queryParams": [],
    "toolName": "presets__remove"
  },
  {
    "bodyFields": [
      "blacklists",
      "brand",
      "camera",
      "category",
      "description",
      "ingredient",
      "isActive",
      "isDeleted",
      "isFavorite",
      "key",
      "label",
      "model",
      "mood",
      "organization",
      "platform",
      "prompt",
      "scene",
      "style"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "PresetsController.update",
    "path": "/presets/{presetId}",
    "pathParams": [
      "presetId"
    ],
    "queryParams": [],
    "toolName": "presets__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ProfilesController.analyzeTone",
    "path": "/profiles/{profileId}/analyze",
    "pathParams": [],
    "queryParams": [],
    "toolName": "profiles__analyze_tone"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ProfilesController.applyProfile",
    "path": "/profiles/{profileId}/apply",
    "pathParams": [],
    "queryParams": [],
    "toolName": "profiles__apply_profile"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ProfilesController.create",
    "path": "/profiles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "profiles__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ProfilesController.findAll",
    "path": "/profiles",
    "pathParams": [],
    "queryParams": [
      "isDefault",
      "search"
    ],
    "toolName": "profiles__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ProfilesController.findOne",
    "path": "/profiles/{profileId}",
    "pathParams": [
      "profileId"
    ],
    "queryParams": [],
    "toolName": "profiles__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ProfilesController.generateFromExamples",
    "path": "/profiles/generate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "profiles__generate_from_examples"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ProfilesController.remove",
    "path": "/profiles/{profileId}",
    "pathParams": [
      "profileId"
    ],
    "queryParams": [],
    "toolName": "profiles__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ProfilesController.update",
    "path": "/profiles/{profileId}",
    "pathParams": [
      "profileId"
    ],
    "queryParams": [],
    "toolName": "profiles__update"
  },
  {
    "bodyFields": [
      "description",
      "label",
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "ProjectsController.create",
    "path": "/projects",
    "pathParams": [],
    "queryParams": [],
    "toolName": "projects__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ProjectsController.findAll",
    "path": "/projects",
    "pathParams": [],
    "queryParams": [],
    "toolName": "projects__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ProjectsController.findOne",
    "path": "/projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "projects__find_one"
  },
  {
    "bodyFields": [
      "description",
      "isDeleted",
      "label",
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "ProjectsController.patch",
    "path": "/projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "projects__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ProjectsController.remove",
    "path": "/projects/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "projects__remove"
  },
  {
    "bodyFields": [
      "blacklists",
      "brand",
      "camera",
      "category",
      "duration",
      "fontFamily",
      "fps",
      "isFavorite",
      "isSkipEnhancement",
      "model",
      "mood",
      "organization",
      "original",
      "ratio",
      "reference",
      "resolution",
      "scene",
      "scope",
      "seed",
      "sounds",
      "speech",
      "status",
      "style",
      "systemPromptKey",
      "tags"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PromptsController.create",
    "path": "/prompts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "prompts__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PromptsController.findAll",
    "path": "/prompts",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "scope",
      "sort"
    ],
    "toolName": "prompts__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PromptsController.findOne",
    "path": "/prompts/{promptId}",
    "pathParams": [
      "promptId"
    ],
    "queryParams": [],
    "toolName": "prompts__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PromptsController.publishToMarketplace",
    "path": "/prompts/{promptId}/publish",
    "pathParams": [
      "promptId"
    ],
    "queryParams": [],
    "toolName": "prompts__publish_to_marketplace"
  },
  {
    "bodyFields": [
      "blacklists",
      "brand",
      "camera",
      "category",
      "duration",
      "fontFamily",
      "fps",
      "ingredient",
      "isDeleted",
      "isFavorite",
      "isSkipEnhancement",
      "model",
      "mood",
      "organization",
      "original",
      "ratio",
      "reference",
      "resolution",
      "scene",
      "scope",
      "seed",
      "sounds",
      "speech",
      "status",
      "style",
      "systemPromptKey",
      "tags"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "PromptsController.update",
    "path": "/prompts/{promptId}",
    "pathParams": [
      "promptId"
    ],
    "queryParams": [],
    "toolName": "prompts__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PromptsOperationsController.createRemix",
    "path": "/prompts/{promptId}/remix",
    "pathParams": [
      "promptId"
    ],
    "queryParams": [],
    "toolName": "prompts_operations__create_remix"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PromptsOperationsController.enhanceExisting",
    "path": "/prompts/{promptId}/enhance",
    "pathParams": [
      "promptId"
    ],
    "queryParams": [],
    "toolName": "prompts_operations__enhance_existing"
  },
  {
    "bodyFields": [
      "context",
      "customInstructions",
      "length",
      "tagGrok",
      "tone",
      "tweetAuthor",
      "tweetContent",
      "tweetUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PromptsOperationsController.generateTweetReply",
    "path": "/prompts/tweet",
    "pathParams": [],
    "queryParams": [],
    "toolName": "prompts_operations__generate_tweet_reply"
  },
  {
    "bodyFields": [
      "brand",
      "category",
      "original"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "PromptsOperationsController.parse",
    "path": "/prompts/parse",
    "pathParams": [],
    "queryParams": [],
    "toolName": "prompts_operations__parse"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PromptsOperationsController.voiceToSpeech",
    "path": "/prompts/voice-to-speech",
    "pathParams": [],
    "queryParams": [],
    "toolName": "prompts_operations__voice_to_speech"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicArticlesController.findPublicArticleById",
    "path": "/public/articles/{articleId}",
    "pathParams": [
      "articleId"
    ],
    "queryParams": [],
    "toolName": "public_articles__find_public_article_by_id"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicArticlesController.findPublicArticleBySlug",
    "path": "/public/articles/slug/{slug}",
    "pathParams": [
      "slug"
    ],
    "queryParams": [
      "isPreview"
    ],
    "toolName": "public_articles__find_public_article_by_slug"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicArticlesController.findPublicArticles",
    "path": "/public/articles",
    "pathParams": [],
    "queryParams": [
      "brand",
      "category",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "scope",
      "search",
      "sort",
      "sortBy",
      "sortOrder",
      "status",
      "tag"
    ],
    "toolName": "public_articles__find_public_articles"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicBrandsController.findBrandArticles",
    "path": "/public/brands/{brandId}/articles",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "limit",
      "page",
      "sort"
    ],
    "toolName": "public_brands__find_brand_articles"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicBrandsController.findBrandImages",
    "path": "/public/brands/{brandId}/images",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "limit",
      "page",
      "sort"
    ],
    "toolName": "public_brands__find_brand_images"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicBrandsController.findBrandLinks",
    "path": "/public/brands/{brandId}/links",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "sort"
    ],
    "toolName": "public_brands__find_brand_links"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicBrandsController.findBrandVideos",
    "path": "/public/brands/{brandId}/videos",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [
      "limit",
      "page",
      "sort"
    ],
    "toolName": "public_brands__find_brand_videos"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicBrandsController.findOne",
    "path": "/public/brands/{brandId}",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "public_brands__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicBrandsController.findOneBySlug",
    "path": "/public/brands/slug",
    "pathParams": [],
    "queryParams": [
      "slug"
    ],
    "toolName": "public_brands__find_one_by_slug"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicBrandsController.findPublicBrands",
    "path": "/public/brands",
    "pathParams": [],
    "queryParams": [
      "isHighlighted",
      "limit"
    ],
    "toolName": "public_brands__find_public_brands"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicImagesController.findPublicImages",
    "path": "/public/images",
    "pathParams": [],
    "queryParams": [
      "brand",
      "format",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort",
      "tag"
    ],
    "toolName": "public_images__find_public_images"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicImagesController.getImage",
    "path": "/public/images/{imageId}/image.jpg",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "public_images__get_image"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicImagesController.getImageMetadata",
    "path": "/public/images/{imageId}",
    "pathParams": [
      "imageId"
    ],
    "queryParams": [],
    "toolName": "public_images__get_image_metadata"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicMediaController.getManifest",
    "path": "/public/media/{assetId}/manifest.json",
    "pathParams": [
      "assetId"
    ],
    "queryParams": [],
    "toolName": "public_media__get_manifest"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicMediaController.getTranscript",
    "path": "/public/media/{assetId}/transcript.vtt",
    "pathParams": [
      "assetId"
    ],
    "queryParams": [],
    "toolName": "public_media__get_transcript"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicMediaController.resolveMedia",
    "path": "/public/media/{assetId}",
    "pathParams": [
      "assetId"
    ],
    "queryParams": [],
    "toolName": "public_media__resolve_media"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicMusicsController.findPublicMusics",
    "path": "/public/musics",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort",
      "tag"
    ],
    "toolName": "public_musics__find_public_musics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicMusicsController.getMusic",
    "path": "/public/musics/{musicId}/audio.mp3",
    "pathParams": [
      "musicId"
    ],
    "queryParams": [],
    "toolName": "public_musics__get_music"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicMusicsController.getMusicMetadata",
    "path": "/public/musics/{musicId}",
    "pathParams": [
      "musicId"
    ],
    "queryParams": [],
    "toolName": "public_musics__get_music_metadata"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicPostsController.findPublicIngredients",
    "path": "/public/posts/ingredients",
    "pathParams": [],
    "queryParams": [
      "brand",
      "category",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort",
      "tag"
    ],
    "toolName": "public_posts__find_public_ingredients"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicPostsController.findPublicPosts",
    "path": "/public/posts",
    "pathParams": [],
    "queryParams": [
      "brand",
      "ingredient",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort",
      "tag"
    ],
    "toolName": "public_posts__find_public_posts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicPostsController.getPostMetadata",
    "path": "/public/posts/{postId}",
    "pathParams": [
      "postId"
    ],
    "queryParams": [],
    "toolName": "public_posts__get_post_metadata"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicRSSController.getBrandFeed",
    "path": "/public/rss/brands/{brandId}",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "public_rss__get_brand_feed"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicRSSController.getGlobalFeed",
    "path": "/public/rss/articles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "public_rss__get_global_feed"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicRSSController.getOrganizationFeed",
    "path": "/public/rss/organizations/{organizationId}",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "public_rss__get_organization_feed"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicRSSController.getUserFeed",
    "path": "/public/rss/users/{userId}",
    "pathParams": [
      "userId"
    ],
    "queryParams": [],
    "toolName": "public_rss__get_user_feed"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicVideosController.findPublicVideos",
    "path": "/public/videos",
    "pathParams": [],
    "queryParams": [
      "brand",
      "format",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort",
      "tag"
    ],
    "toolName": "public_videos__find_public_videos"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicVideosController.getVideo",
    "path": "/public/videos/{videoId}/video.mp4",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "public_videos__get_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "PublicVideosController.getVideoMetadata",
    "path": "/public/videos/{videoId}",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "public_videos__get_video_metadata"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "PublishApprovalsController.create",
    "path": "/publish-approvals",
    "pathParams": [],
    "queryParams": [],
    "toolName": "publish_approvals__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "RedditController.connect",
    "path": "/services/reddit/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "reddit__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "RedditController.verify",
    "path": "/services/reddit/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "reddit__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "RedirectController.redirect",
    "path": "/l/{shortCode}",
    "pathParams": [
      "shortCode"
    ],
    "queryParams": [],
    "toolName": "redirect__redirect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ReplyBotConfigsController.create",
    "path": "/reply-bot-configs",
    "pathParams": [],
    "queryParams": [],
    "toolName": "reply_bot_configs__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ReplyBotConfigsController.findAll",
    "path": "/reply-bot-configs",
    "pathParams": [],
    "queryParams": [],
    "toolName": "reply_bot_configs__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ReplyBotConfigsController.findOne",
    "path": "/reply-bot-configs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "reply_bot_configs__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ReplyBotConfigsController.getQueueStatus",
    "path": "/reply-bot-configs/queue-status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "reply_bot_configs__get_queue_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "ReplyBotConfigsController.patch",
    "path": "/reply-bot-configs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "reply_bot_configs__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "ReplyBotConfigsController.remove",
    "path": "/reply-bot-configs/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "reply_bot_configs__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ReplyBotConfigsController.testReplyGeneration",
    "path": "/reply-bot-configs/{id}/test",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "reply_bot_configs__test_reply_generation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ReplyBotConfigsController.triggerPolling",
    "path": "/reply-bot-configs/trigger-polling",
    "pathParams": [],
    "queryParams": [],
    "toolName": "reply_bot_configs__trigger_polling"
  },
  {
    "bodyFields": [
      "key",
      "label",
      "primaryColor"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "RolesController.create",
    "path": "/roles",
    "pathParams": [],
    "queryParams": [],
    "toolName": "roles__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "RolesController.findAll",
    "path": "/roles",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "roles__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "RolesController.findOne",
    "path": "/roles/{roleId}",
    "pathParams": [
      "roleId"
    ],
    "queryParams": [],
    "toolName": "roles__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "RolesController.remove",
    "path": "/roles/{roleId}",
    "pathParams": [
      "roleId"
    ],
    "queryParams": [],
    "toolName": "roles__remove"
  },
  {
    "bodyFields": [
      "isDeleted",
      "key",
      "label",
      "primaryColor"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "RolesController.update",
    "path": "/roles/{roleId}",
    "pathParams": [
      "roleId"
    ],
    "queryParams": [],
    "toolName": "roles__update"
  },
  {
    "bodyFields": [
      "category",
      "dimensions",
      "duration",
      "outputs",
      "prioritize",
      "prompt",
      "speech"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "RouterController.selectModel",
    "path": "/router/select-model",
    "pathParams": [],
    "queryParams": [],
    "toolName": "router__select_model"
  },
  {
    "bodyFields": [
      "message",
      "payload",
      "source",
      "traceId",
      "type"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "RunsController.appendEvent",
    "path": "/runs/{runId}/events",
    "pathParams": [
      "runId"
    ],
    "queryParams": [],
    "toolName": "runs__append_event"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "RunsController.cancel",
    "path": "/runs/{runId}/cancel",
    "pathParams": [
      "runId"
    ],
    "queryParams": [],
    "toolName": "runs__cancel"
  },
  {
    "bodyFields": [
      "actionType",
      "correlationId",
      "idempotencyKey",
      "input",
      "metadata",
      "surface",
      "traceId",
      "trigger"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "RunsController.create",
    "path": "/runs",
    "pathParams": [],
    "queryParams": [],
    "toolName": "runs__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "RunsController.execute",
    "path": "/runs/{runId}/execute",
    "pathParams": [
      "runId"
    ],
    "queryParams": [],
    "toolName": "runs__execute"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "RunsController.findAll",
    "path": "/runs",
    "pathParams": [],
    "queryParams": [
      "actionType",
      "limit",
      "offset",
      "status",
      "surface"
    ],
    "toolName": "runs__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "RunsController.findOne",
    "path": "/runs/{runId}",
    "pathParams": [
      "runId"
    ],
    "queryParams": [],
    "toolName": "runs__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "RunsController.getEvents",
    "path": "/runs/{runId}/events",
    "pathParams": [
      "runId"
    ],
    "queryParams": [],
    "toolName": "runs__get_events"
  },
  {
    "bodyFields": [
      "error",
      "output",
      "progress",
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "RunsController.update",
    "path": "/runs/{runId}",
    "pathParams": [
      "runId"
    ],
    "queryParams": [],
    "toolName": "runs__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SchedulesController.bulkSchedule",
    "path": "/schedules/bulk",
    "pathParams": [],
    "queryParams": [],
    "toolName": "schedules__bulk_schedule"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SchedulesController.getCalendar",
    "path": "/schedules/calendar",
    "pathParams": [],
    "queryParams": [
      "end",
      "start"
    ],
    "toolName": "schedules__get_calendar"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SchedulesController.getChannelCapability",
    "path": "/schedules/channel-capabilities/{platform}",
    "pathParams": [
      "platform"
    ],
    "queryParams": [],
    "toolName": "schedules__get_channel_capability"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SchedulesController.getOptimalTime",
    "path": "/schedules/optimal",
    "pathParams": [],
    "queryParams": [],
    "toolName": "schedules__get_optimal_time"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SchedulesController.getRepurposingStatus",
    "path": "/schedules/repurpose/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "schedules__get_repurposing_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SchedulesController.listChannelCapabilities",
    "path": "/schedules/channel-capabilities",
    "pathParams": [],
    "queryParams": [
      "includeHidden",
      "includePlanned"
    ],
    "toolName": "schedules__list_channel_capabilities"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SchedulesController.repurposeContent",
    "path": "/schedules/repurpose",
    "pathParams": [],
    "queryParams": [],
    "toolName": "schedules__repurpose_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "SchedulesController.validateChannelTargetSettings",
    "path": "/schedules/channel-capabilities/validate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "schedules__validate_channel_target_settings"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ShopifyController.createProduct",
    "path": "/services/shopify/products",
    "pathParams": [],
    "queryParams": [],
    "toolName": "shopify__create_product"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ShopifyController.exchangeToken",
    "path": "/services/shopify/token",
    "pathParams": [],
    "queryParams": [],
    "toolName": "shopify__exchange_token"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ShopifyController.getAuthUrl",
    "path": "/services/shopify/auth",
    "pathParams": [],
    "queryParams": [
      "shop",
      "state"
    ],
    "toolName": "shopify__get_auth_url"
  },
  {
    "bodyFields": [
      "cancelUrl",
      "email",
      "successUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SkillCheckoutController.createCheckout",
    "path": "/skills-pro/checkout",
    "pathParams": [],
    "queryParams": [],
    "toolName": "skill_checkout__create_checkout"
  },
  {
    "bodyFields": [
      "receiptId",
      "skillSlug"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SkillDownloadController.downloadSkill",
    "path": "/skills-pro/download",
    "pathParams": [],
    "queryParams": [],
    "toolName": "skill_download__download_skill"
  },
  {
    "bodyFields": [
      "receiptId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SkillDownloadController.verifyReceipt",
    "path": "/skills-pro/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "skill_download__verify_receipt"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SkillRegistryController.getRegistry",
    "path": "/skills-pro/registry",
    "pathParams": [],
    "queryParams": [],
    "toolName": "skill_registry__get_registry"
  },
  {
    "bodyFields": [
      "baseSkill",
      "category",
      "channels",
      "configSchema",
      "defaultInstructions",
      "description",
      "inputSchema",
      "isBuiltIn",
      "modalities",
      "name",
      "outputSchema",
      "requiredProviders",
      "reviewDefaults",
      "slug",
      "source",
      "status",
      "systemPromptTemplate",
      "toolOverrides",
      "workflowStage"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SkillsController.createSkill",
    "path": "/skills",
    "pathParams": [],
    "queryParams": [],
    "toolName": "skills__create_skill"
  },
  {
    "bodyFields": [
      "description",
      "name",
      "slug"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SkillsController.customizeSkill",
    "path": "/skills/{id}/customize",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "skills__customize_skill"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SkillsController.getSkill",
    "path": "/skills/{slug}",
    "pathParams": [
      "slug"
    ],
    "queryParams": [],
    "toolName": "skills__get_skill"
  },
  {
    "bodyFields": [
      "baseSkill",
      "category",
      "channels",
      "configSchema",
      "defaultInstructions",
      "description",
      "inputSchema",
      "modalities",
      "name",
      "outputSchema",
      "requiredProviders",
      "reviewDefaults",
      "slug",
      "source",
      "sourceUrl",
      "status",
      "systemPromptTemplate",
      "toolOverrides",
      "workflowStage"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SkillsController.importSkill",
    "path": "/skills/import",
    "pathParams": [],
    "queryParams": [],
    "toolName": "skills__import_skill"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SkillsController.listSkills",
    "path": "/skills",
    "pathParams": [],
    "queryParams": [],
    "toolName": "skills__list_skills"
  },
  {
    "bodyFields": [
      "category",
      "channels",
      "configSchema",
      "defaultInstructions",
      "description",
      "inputSchema",
      "modalities",
      "name",
      "outputSchema",
      "requiredProviders",
      "reviewDefaults",
      "slug",
      "status",
      "systemPromptTemplate",
      "toolOverrides",
      "workflowStage"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "SkillsController.updateSkill",
    "path": "/skills/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "skills__update_skill"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "SnapchatController.exchangeToken",
    "path": "/services/snapchat/token",
    "pathParams": [],
    "queryParams": [],
    "toolName": "snapchat__exchange_token"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SnapchatController.getAuthUrl",
    "path": "/services/snapchat/auth",
    "pathParams": [],
    "queryParams": [
      "state"
    ],
    "toolName": "snapchat__get_auth_url"
  },
  {
    "bodyFields": [
      "agentRunId",
      "idempotencyKey",
      "messageType",
      "recipientId",
      "text",
      "workflowRunId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialInboxController.createDraft",
    "path": "/messages/{conversationId}/drafts",
    "pathParams": [
      "conversationId"
    ],
    "queryParams": [],
    "toolName": "social_inbox__create_draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SocialInboxController.getConversation",
    "path": "/messages/{conversationId}",
    "pathParams": [
      "conversationId"
    ],
    "queryParams": [],
    "toolName": "social_inbox__get_conversation"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SocialInboxController.listConversations",
    "path": "/messages",
    "pathParams": [],
    "queryParams": [
      "assignedOwnerId",
      "automationState",
      "brand",
      "conversationType",
      "credentialId",
      "isDeleted",
      "isFavorite",
      "limit",
      "needsReview",
      "organization",
      "page",
      "pagination",
      "platform",
      "search",
      "sort",
      "status",
      "tag",
      "unread"
    ],
    "toolName": "social_inbox__list_conversations"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SocialInboxController.listMessages",
    "path": "/messages/{conversationId}/messages",
    "pathParams": [
      "conversationId"
    ],
    "queryParams": [
      "brand",
      "cursor",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "social_inbox__list_messages"
  },
  {
    "bodyFields": [
      "agentRunId",
      "idempotencyKey",
      "text",
      "workflowRunId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialInboxController.postReply",
    "path": "/messages/{conversationId}/replies",
    "pathParams": [
      "conversationId"
    ],
    "queryParams": [],
    "toolName": "social_inbox__post_reply"
  },
  {
    "bodyFields": [
      "agentRunId",
      "idempotencyKey",
      "recipientId",
      "text",
      "workflowRunId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialInboxController.sendDm",
    "path": "/messages/{conversationId}/dms",
    "pathParams": [
      "conversationId"
    ],
    "queryParams": [],
    "toolName": "social_inbox__send_dm"
  },
  {
    "bodyFields": [
      "credentialId",
      "limit"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialInboxController.syncYoutubeComments",
    "path": "/messages/youtube/sync",
    "pathParams": [],
    "queryParams": [],
    "toolName": "social_inbox__sync_youtube_comments"
  },
  {
    "bodyFields": [
      "assignedOwnerId",
      "status",
      "tags"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "SocialInboxController.updateConversation",
    "path": "/messages/{conversationId}",
    "pathParams": [
      "conversationId"
    ],
    "queryParams": [],
    "toolName": "social_inbox__update_conversation"
  },
  {
    "bodyFields": [
      "reason",
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "SocialInboxController.updateDraft",
    "path": "/messages/{conversationId}/drafts/{messageId}",
    "pathParams": [
      "conversationId",
      "messageId"
    ],
    "queryParams": [],
    "toolName": "social_inbox__update_draft"
  },
  {
    "bodyFields": [
      "avatarUrl",
      "bio",
      "credential",
      "displayName",
      "externalId",
      "followersCount",
      "handle",
      "isActive",
      "platform",
      "profileUrl",
      "sourceType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialSourcesController.create",
    "path": "/social-sources",
    "pathParams": [],
    "queryParams": [],
    "toolName": "social_sources__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SocialSourcesController.findAll",
    "path": "/social-sources",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isActive",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "platform",
      "postsLimit",
      "search",
      "sort",
      "source"
    ],
    "toolName": "social_sources__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SocialSourcesController.findOne",
    "path": "/social-sources/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "social_sources__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SocialSourcesController.getFeed",
    "path": "/social-sources/feed",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isActive",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "platform",
      "postsLimit",
      "search",
      "sort",
      "source"
    ],
    "toolName": "social_sources__get_feed"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "SocialSourcesController.remove",
    "path": "/social-sources/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "social_sources__remove"
  },
  {
    "bodyFields": [
      "limit"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialSourcesController.syncBrand",
    "path": "/social-sources/sync",
    "pathParams": [],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "social_sources__sync_brand"
  },
  {
    "bodyFields": [
      "limit"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialSourcesController.syncOne",
    "path": "/social-sources/{id}/sync",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "social_sources__sync_one"
  },
  {
    "bodyFields": [
      "avatarUrl",
      "bio",
      "credential",
      "displayName",
      "externalId",
      "followersCount",
      "handle",
      "isActive",
      "platform",
      "profileUrl",
      "sourceType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "SocialSourcesController.update",
    "path": "/social-sources/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "social_sources__update"
  },
  {
    "bodyFields": [
      "handle",
      "platform"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SocialSourcesController.validate",
    "path": "/social-sources/validate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "social_sources__validate"
  },
  {
    "bodyFields": [
      "actionType",
      "text"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SourcePostsController.createDraft",
    "path": "/source-posts/{id}/actions/draft",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "source_posts__create_draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SourcePostsController.findAll",
    "path": "/source-posts",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "platform",
      "search",
      "sort",
      "source"
    ],
    "toolName": "source_posts__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SourcePostsController.findOne",
    "path": "/source-posts/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "source_posts__find_one"
  },
  {
    "bodyFields": [
      "actionType",
      "text"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SourcePostsController.publishTwitterAction",
    "path": "/source-posts/{id}/actions/twitter",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "brand",
      "organization"
    ],
    "toolName": "source_posts__publish_twitter_action"
  },
  {
    "bodyFields": [
      "language",
      "prompt"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SpeechController.transcribeAudio",
    "path": "/speech/transcribe/audio",
    "pathParams": [],
    "queryParams": [],
    "toolName": "speech__transcribe_audio"
  },
  {
    "bodyFields": [
      "language",
      "prompt",
      "url"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "SpeechController.transcribeUrl",
    "path": "/speech/transcribe/url",
    "pathParams": [],
    "queryParams": [],
    "toolName": "speech__transcribe_url"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "StreaksController.getMyCalendar",
    "path": "/organizations/{organizationId}/streaks/me/calendar",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "streaks__get_my_calendar"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "StreaksController.getMyStreak",
    "path": "/organizations/{organizationId}/streaks/me",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "streaks__get_my_streak"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "StreaksController.patchMyStreak",
    "path": "/organizations/{organizationId}/streaks/me",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "streaks__patch_my_streak"
  },
  {
    "bodyFields": [
      "cancelUrl",
      "quantity",
      "stripePriceId",
      "successUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "StripeController.createCheckoutSession",
    "path": "/services/stripe/checkout",
    "pathParams": [],
    "queryParams": [],
    "toolName": "stripe__create_checkout_session"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "StripeController.createSetupCheckout",
    "path": "/services/stripe/setup-intent",
    "pathParams": [],
    "queryParams": [],
    "toolName": "stripe__create_setup_checkout"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "StripeController.getBillingPortalUrl",
    "path": "/services/stripe/portal",
    "pathParams": [],
    "queryParams": [],
    "toolName": "stripe__get_billing_portal_url"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SyncController.getStatus",
    "path": "/sync/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "sync__get_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "SyncController.pullWorkflow",
    "path": "/sync/workflows/pull/{cloudId}",
    "pathParams": [
      "cloudId"
    ],
    "queryParams": [],
    "toolName": "sync__pull_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "SyncController.pushWorkflow",
    "path": "/sync/workflows/push/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "sync__push_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "SystemController.getDbMode",
    "path": "/system/db-mode",
    "pathParams": [],
    "queryParams": [],
    "toolName": "system__get_db_mode"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TagsController.create",
    "path": "/tags",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tags__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TagsController.findAll",
    "path": "/tags",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tags__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TagsController.findOne",
    "path": "/tags/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tags__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "TagsController.patch",
    "path": "/tags/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tags__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "TagsController.remove",
    "path": "/tags/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tags__remove"
  },
  {
    "bodyFields": [
      "body"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TaskCommentsController.create",
    "path": "/tasks/{taskId}/comments",
    "pathParams": [
      "taskId"
    ],
    "queryParams": [],
    "toolName": "task_comments__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TaskCommentsController.findAll",
    "path": "/tasks/{taskId}/comments",
    "pathParams": [
      "taskId"
    ],
    "queryParams": [],
    "toolName": "task_comments__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "TaskCommentsController.remove",
    "path": "/tasks/{taskId}/comments/{commentId}",
    "pathParams": [
      "commentId"
    ],
    "queryParams": [],
    "toolName": "task_comments__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TasksController.checkout",
    "path": "/tasks/{id}/checkout",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__checkout"
  },
  {
    "bodyFields": [
      "assigneeAgentId",
      "assigneeUserId",
      "description",
      "goalId",
      "heygenAvatarId",
      "linkedEntities",
      "outputType",
      "parentId",
      "platforms",
      "priority",
      "projectId",
      "request",
      "status",
      "title",
      "voiceId",
      "voiceProvider"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TasksController.create",
    "path": "/tasks",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tasks__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TasksController.createChildren",
    "path": "/tasks/{id}/children",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__create_children"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TasksController.findAll",
    "path": "/tasks",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tasks__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TasksController.findByIdentifier",
    "path": "/tasks/by-identifier/{identifier}",
    "pathParams": [
      "identifier"
    ],
    "queryParams": [],
    "toolName": "tasks__find_by_identifier"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TasksController.findChildren",
    "path": "/tasks/{id}/children",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__find_children"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TasksController.findOne",
    "path": "/tasks/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TasksController.openPlanThread",
    "path": "/tasks/{id}/plan-thread",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__open_plan_thread"
  },
  {
    "bodyFields": [
      "assigneeAgentId",
      "assigneeUserId",
      "description",
      "goalId",
      "heygenAvatarId",
      "isDeleted",
      "linkedEntities",
      "outputType",
      "parentId",
      "platforms",
      "priority",
      "projectId",
      "reason",
      "request",
      "reviewState",
      "status",
      "title",
      "voiceId",
      "voiceProvider"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "TasksController.patch",
    "path": "/tasks/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TasksController.release",
    "path": "/tasks/{id}/release",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__release"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "TasksController.remove",
    "path": "/tasks/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tasks__remove"
  },
  {
    "bodyFields": [
      "isKept"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "TasksController.setOutputKept",
    "path": "/tasks/{id}/outputs/{outputId}",
    "pathParams": [
      "id",
      "outputId"
    ],
    "queryParams": [],
    "toolName": "tasks__set_output_kept"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "TasksController.trashOutput",
    "path": "/tasks/{id}/outputs/{outputId}",
    "pathParams": [
      "id",
      "outputId"
    ],
    "queryParams": [],
    "toolName": "tasks__trash_output"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TeamMentionsController.getMentions",
    "path": "/team/mentions",
    "pathParams": [],
    "queryParams": [],
    "toolName": "team_mentions__get_mentions"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TelegramController.verify",
    "path": "/services/telegram/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "telegram__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TelegramBotController.getStatus",
    "path": "/telegram-bot/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "telegram_bot__get_status"
  },
  {
    "bodyFields": [
      "categories",
      "category",
      "content",
      "description",
      "industries",
      "isActive",
      "key",
      "label",
      "metadata",
      "platforms",
      "purpose",
      "scope",
      "tags",
      "variables",
      "version"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TemplatesController.create",
    "path": "/templates",
    "pathParams": [],
    "queryParams": [],
    "toolName": "templates__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TemplatesController.findAll",
    "path": "/templates",
    "pathParams": [],
    "queryParams": [
      "category",
      "industry",
      "isFeatured",
      "key",
      "limit",
      "platform",
      "purpose",
      "scope",
      "search",
      "sort"
    ],
    "toolName": "templates__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TemplatesController.findOne",
    "path": "/templates/{templateId}",
    "pathParams": [
      "templateId"
    ],
    "queryParams": [],
    "toolName": "templates__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "TemplatesController.remove",
    "path": "/templates/{templateId}",
    "pathParams": [
      "templateId"
    ],
    "queryParams": [],
    "toolName": "templates__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TemplatesController.suggestTemplates",
    "path": "/templates/suggest",
    "pathParams": [],
    "queryParams": [],
    "toolName": "templates__suggest_templates"
  },
  {
    "bodyFields": [
      "categories",
      "category",
      "content",
      "description",
      "industries",
      "isActive",
      "key",
      "label",
      "metadata",
      "platforms",
      "purpose",
      "scope",
      "tags",
      "variables",
      "version"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "TemplatesController.update",
    "path": "/templates/{templateId}",
    "pathParams": [
      "templateId"
    ],
    "queryParams": [],
    "toolName": "templates__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TemplatesController.useTemplate",
    "path": "/templates/{templateId}/use",
    "pathParams": [],
    "queryParams": [],
    "toolName": "templates__use_template"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ThreadRunsController.getThreadRuns",
    "path": "/threads/{threadId}/runs",
    "pathParams": [
      "threadId"
    ],
    "queryParams": [
      "cursor",
      "limit"
    ],
    "toolName": "thread_runs__get_thread_runs"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ThreadsController.connect",
    "path": "/services/threads/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "threads__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "ThreadsController.getTrends",
    "path": "/services/threads/trends",
    "pathParams": [],
    "queryParams": [],
    "toolName": "threads__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "ThreadsController.verify",
    "path": "/services/threads/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "threads__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TiktokController.connect",
    "path": "/services/tiktok/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tiktok__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TiktokController.getTrends",
    "path": "/services/tiktok/trends",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tiktok__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TiktokController.verify",
    "path": "/services/tiktok/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tiktok__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "TrackedLinksController.deleteLink",
    "path": "/tracking/links/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tracked_links__delete_link"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TrackedLinksController.generateLink",
    "path": "/tracking/links",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tracked_links__generate_link"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrackedLinksController.getContentCTAStats",
    "path": "/tracking/content/{contentId}/cta-stats",
    "pathParams": [
      "contentId"
    ],
    "queryParams": [],
    "toolName": "tracked_links__get_content_cta_stats"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrackedLinksController.getLink",
    "path": "/tracking/links/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tracked_links__get_link"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrackedLinksController.getLinkPerformance",
    "path": "/tracking/links/{id}/performance",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tracked_links__get_link_performance"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrackedLinksController.getLinks",
    "path": "/tracking/links",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tracked_links__get_links"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TrackedLinksController.trackClick",
    "path": "/tracking/clicks",
    "pathParams": [],
    "queryParams": [],
    "toolName": "tracked_links__track_click"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "TrackedLinksController.updateLink",
    "path": "/tracking/links/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "tracked_links__update_link"
  },
  {
    "bodyFields": [
      "baseModel",
      "category",
      "description",
      "label",
      "model",
      "provider",
      "seed",
      "sources",
      "status",
      "steps",
      "trigger"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TrainingsController.create",
    "path": "/trainings",
    "pathParams": [],
    "queryParams": [],
    "toolName": "trainings__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrainingsController.findAll",
    "path": "/trainings",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort",
      "status"
    ],
    "toolName": "trainings__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrainingsController.findOne",
    "path": "/trainings/{trainingId}",
    "pathParams": [
      "trainingId"
    ],
    "queryParams": [],
    "toolName": "trainings__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "TrainingsController.patch",
    "path": "/trainings/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "trainings__patch"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "TrainingsController.remove",
    "path": "/trainings/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "trainings__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrainingsOperationsController.getTrainingImages",
    "path": "/trainings/{trainingId}/images",
    "pathParams": [
      "trainingId"
    ],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "isPublic",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "references",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "trainings_operations__get_training_images"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrainingsOperationsController.getTrainingSources",
    "path": "/trainings/{trainingId}/sources",
    "pathParams": [
      "trainingId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "trainings_operations__get_training_sources"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TrainingsOperationsController.relaunchTraining",
    "path": "/trainings/{trainingId}/train",
    "pathParams": [
      "trainingId"
    ],
    "queryParams": [],
    "toolName": "trainings_operations__relaunch_training"
  },
  {
    "bodyFields": [
      "youtubeUrl"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TranscriptsController.create",
    "path": "/transcripts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "transcripts__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TranscriptsController.findAll",
    "path": "/transcripts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "transcripts__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TranscriptsController.findOne",
    "path": "/transcripts/{transcriptId}",
    "pathParams": [
      "transcriptId"
    ],
    "queryParams": [],
    "toolName": "transcripts__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "TranscriptsController.update",
    "path": "/transcripts/{transcriptId}",
    "pathParams": [
      "transcriptId"
    ],
    "queryParams": [],
    "toolName": "transcripts__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.analyzeTrends",
    "path": "/trends/analyze",
    "pathParams": [],
    "queryParams": [
      "daysBack",
      "platform",
      "topic"
    ],
    "toolName": "trends__analyze_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getCorpusFreshnessHealth",
    "path": "/trends/corpus/health",
    "pathParams": [],
    "queryParams": [
      "platform"
    ],
    "toolName": "trends__get_corpus_freshness_health"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getPreferences",
    "path": "/trends/preferences",
    "pathParams": [],
    "queryParams": [],
    "toolName": "trends__get_preferences"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getPromptReferencePacks",
    "path": "/trends/references/packs",
    "pathParams": [],
    "queryParams": [
      "intent",
      "limit",
      "platform",
      "types"
    ],
    "toolName": "trends__get_prompt_reference_packs"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getReferenceCorpus",
    "path": "/trends/references",
    "pathParams": [],
    "queryParams": [
      "authorHandle",
      "includePaidCreative",
      "intendedUse",
      "limit",
      "platform",
      "sourceKind",
      "trendId"
    ],
    "toolName": "trends__get_reference_corpus"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTopReferenceAccounts",
    "path": "/trends/references/accounts",
    "pathParams": [],
    "queryParams": [
      "limit",
      "platform"
    ],
    "toolName": "trends__get_top_reference_accounts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrendById",
    "path": "/trends/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "trends__get_trend_by_id"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrendContent",
    "path": "/trends/content",
    "pathParams": [],
    "queryParams": [
      "limit",
      "platform",
      "refresh"
    ],
    "toolName": "trends__get_trend_content"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrendIdeas",
    "path": "/trends/ideas",
    "pathParams": [],
    "queryParams": [
      "brandId",
      "limit",
      "organizationId",
      "platform"
    ],
    "toolName": "trends__get_trend_ideas"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrendSources",
    "path": "/trends/{id}/sources",
    "pathParams": [
      "id"
    ],
    "queryParams": [
      "limit"
    ],
    "toolName": "trends__get_trend_sources"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrendingHashtags",
    "path": "/trends/hashtags",
    "pathParams": [],
    "queryParams": [
      "limit",
      "platform"
    ],
    "toolName": "trends__get_trending_hashtags"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrendingSounds",
    "path": "/trends/sounds",
    "pathParams": [],
    "queryParams": [
      "limit"
    ],
    "toolName": "trends__get_trending_sounds"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrends",
    "path": "/trends",
    "pathParams": [],
    "queryParams": [
      "platform",
      "refresh"
    ],
    "toolName": "trends__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTrendsDiscovery",
    "path": "/trends/discovery",
    "pathParams": [],
    "queryParams": [
      "platform",
      "refresh"
    ],
    "toolName": "trends__get_trends_discovery"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTurnoverStats",
    "path": "/trends/turnover",
    "pathParams": [],
    "queryParams": [
      "days"
    ],
    "toolName": "trends__get_turnover_stats"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getTurnoverTimeline",
    "path": "/trends/turnover/timeline",
    "pathParams": [],
    "queryParams": [
      "days"
    ],
    "toolName": "trends__get_turnover_timeline"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getViralLeaderboard",
    "path": "/trends/leaderboard",
    "pathParams": [],
    "queryParams": [
      "limit"
    ],
    "toolName": "trends__get_viral_leaderboard"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TrendsController.getViralVideos",
    "path": "/trends/videos",
    "pathParams": [],
    "queryParams": [
      "limit",
      "platform",
      "timeframe"
    ],
    "toolName": "trends__get_viral_videos"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TrendsController.refreshTrends",
    "path": "/trends/refresh",
    "pathParams": [],
    "queryParams": [],
    "toolName": "trends__refresh_trends"
  },
  {
    "bodyFields": [
      "autoRequeueWinners",
      "brandId",
      "categories",
      "hashtags",
      "keywords",
      "platforms"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "put",
    "operationId": "TrendsController.savePreferences",
    "path": "/trends/preferences",
    "pathParams": [],
    "queryParams": [],
    "toolName": "trends__save_preferences"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TwitterController.connect",
    "path": "/services/twitter/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "twitter__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "TwitterController.getTrends",
    "path": "/services/twitter/trends",
    "pathParams": [],
    "queryParams": [],
    "toolName": "twitter__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "TwitterController.verify",
    "path": "/services/twitter/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "twitter__verify"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TwitterPipelineController.draft",
    "path": "/organizations/{organizationId}/twitter-pipeline/draft",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "twitter_pipeline__draft"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TwitterPipelineController.publish",
    "path": "/organizations/{organizationId}/twitter-pipeline/publish",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "twitter_pipeline__publish"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "TwitterPipelineController.search",
    "path": "/organizations/{organizationId}/twitter-pipeline/search",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "twitter_pipeline__search"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UnipileController.accounts",
    "path": "/services/unipile/accounts",
    "pathParams": [],
    "queryParams": [
      "cursor"
    ],
    "toolName": "unipile__accounts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UnipileController.calendarEvents",
    "path": "/services/unipile/calendar/events",
    "pathParams": [],
    "queryParams": [
      "accountId",
      "cursor",
      "limit"
    ],
    "toolName": "unipile__calendar_events"
  },
  {
    "bodyFields": [
      "allowedAccountIds",
      "apiBaseUrl",
      "apiKey",
      "defaultAccountId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "UnipileController.configure",
    "path": "/services/unipile/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "unipile__configure"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UnipileController.emails",
    "path": "/services/unipile/emails",
    "pathParams": [],
    "queryParams": [
      "accountId",
      "after",
      "before",
      "cursor",
      "limit",
      "metaOnly"
    ],
    "toolName": "unipile__emails"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UnipileController.messages",
    "path": "/services/unipile/messages",
    "pathParams": [],
    "queryParams": [
      "accountId",
      "cursor",
      "limit"
    ],
    "toolName": "unipile__messages"
  },
  {
    "bodyFields": [
      "accountId",
      "bcc",
      "body",
      "cc",
      "replyTo",
      "subject",
      "to"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "UnipileController.sendEmail",
    "path": "/services/unipile/emails/send",
    "pathParams": [],
    "queryParams": [],
    "toolName": "unipile__send_email"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UnipileController.status",
    "path": "/services/unipile/status",
    "pathParams": [],
    "queryParams": [],
    "toolName": "unipile__status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "UserStripeController.createCheckoutSession",
    "path": "/users/stripe/checkout",
    "pathParams": [],
    "queryParams": [],
    "toolName": "user_stripe__create_checkout_session"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UserStripeController.getBillingPortalUrl",
    "path": "/users/stripe/portal",
    "pathParams": [],
    "queryParams": [],
    "toolName": "user_stripe__get_billing_portal_url"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UserStripeController.getSubscription",
    "path": "/users/stripe/subscription",
    "pathParams": [],
    "queryParams": [],
    "toolName": "user_stripe__get_subscription"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UsersController.findAll",
    "path": "/users",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "users__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UsersController.findMe",
    "path": "/users/me",
    "pathParams": [],
    "queryParams": [],
    "toolName": "users__find_me"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UsersController.findMeBrands",
    "path": "/users/me/brands",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "users__find_me_brands"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UsersController.findMeOrganizations",
    "path": "/users/me/organizations",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "users__find_me_organizations"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UsersController.findMeSettings",
    "path": "/users/me/settings",
    "pathParams": [],
    "queryParams": [],
    "toolName": "users__find_me_settings"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UsersController.findOne",
    "path": "/users/{userId}",
    "pathParams": [
      "userId"
    ],
    "queryParams": [],
    "toolName": "users__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "UsersController.getAvatarUploadUrl",
    "path": "/users/me/avatar",
    "pathParams": [],
    "queryParams": [],
    "toolName": "users__get_avatar_upload_url"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "UsersController.getOnboardingStatus",
    "path": "/users/{userId}/onboarding",
    "pathParams": [
      "userId"
    ],
    "queryParams": [],
    "toolName": "users__get_onboarding_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "UsersController.updateBrandSelection",
    "path": "/users/me/brands/{brandId}",
    "pathParams": [
      "brandId"
    ],
    "queryParams": [],
    "toolName": "users__update_brand_selection"
  },
  {
    "bodyFields": [
      "authProviderId",
      "avatar",
      "email",
      "firstName",
      "handle",
      "isDeleted",
      "isInvited",
      "isOnboardingCompleted",
      "lastName",
      "onboardingCompletedAt",
      "onboardingStartedAt",
      "onboardingStepsCompleted",
      "onboardingType",
      "selectedBrandId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "UsersController.updateMe",
    "path": "/users/me",
    "pathParams": [],
    "queryParams": [],
    "toolName": "users__update_me"
  },
  {
    "bodyFields": [
      "contentPreferences",
      "dashboardPreferences",
      "defaultAgentModel",
      "favoriteModelKeys",
      "generationPriority",
      "isAdvancedMode",
      "isAgentAssetsPanelOpen",
      "isDeleted",
      "isFirstLogin",
      "isMenuCollapsed",
      "isSidebarProgressCollapsed",
      "isSidebarProgressVisible",
      "isTrendNotificationsEmail",
      "isTrendNotificationsInApp",
      "isTrendNotificationsTelegram",
      "isVerified",
      "isVideoNotificationsEmail",
      "isWorkflowNotificationsEmail",
      "theme",
      "trendNotificationsEmailAddress",
      "trendNotificationsFrequency",
      "trendNotificationsMinViralScore",
      "trendNotificationsTelegramChatId",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "UsersController.updateMeSettings",
    "path": "/users/me/settings",
    "pathParams": [],
    "queryParams": [],
    "toolName": "users__update_me_settings"
  },
  {
    "bodyFields": [
      "isOnboardingCompleted",
      "onboardingCompletedAt",
      "onboardingStartedAt",
      "onboardingStepsCompleted",
      "onboardingType"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "UsersController.updateOnboardingStatus",
    "path": "/users/{userId}/onboarding",
    "pathParams": [
      "userId"
    ],
    "queryParams": [],
    "toolName": "users__update_onboarding_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "patch",
    "operationId": "UsersController.updateOrganizationSelection",
    "path": "/users/me/organizations/{organizationId}",
    "pathParams": [
      "organizationId"
    ],
    "queryParams": [],
    "toolName": "users__update_organization_selection"
  },
  {
    "bodyFields": [
      "contentPreferences",
      "dashboardPreferences",
      "defaultAgentModel",
      "favoriteModelKeys",
      "generationPriority",
      "isAdvancedMode",
      "isAgentAssetsPanelOpen",
      "isDeleted",
      "isFirstLogin",
      "isMenuCollapsed",
      "isSidebarProgressCollapsed",
      "isSidebarProgressVisible",
      "isTrendNotificationsEmail",
      "isTrendNotificationsInApp",
      "isTrendNotificationsTelegram",
      "isVerified",
      "isVideoNotificationsEmail",
      "isWorkflowNotificationsEmail",
      "theme",
      "trendNotificationsEmailAddress",
      "trendNotificationsFrequency",
      "trendNotificationsMinViralScore",
      "trendNotificationsTelegramChatId",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "UsersController.updateSettings",
    "path": "/users/{userId}/settings",
    "pathParams": [
      "userId"
    ],
    "queryParams": [],
    "toolName": "users__update_settings"
  },
  {
    "bodyFields": [
      "audioUrl",
      "autoSelectModel",
      "backgroundMusic",
      "blacklist",
      "bookmark",
      "brand",
      "brandingMode",
      "camera",
      "cameraMovement",
      "category",
      "contentRating",
      "duration",
      "endFrame",
      "folder",
      "fontFamily",
      "format",
      "groupId",
      "groupIndex",
      "height",
      "isAudioEnabled",
      "isBrandingEnabled",
      "isDefault",
      "isHighlighted",
      "language",
      "lens",
      "lighting",
      "metadata",
      "metadataId",
      "model",
      "mood",
      "musicVolume",
      "muteVideoAudio",
      "order",
      "outputs",
      "parent",
      "prioritize",
      "prompt",
      "promptTemplate",
      "qualityFeedback",
      "qualityScore",
      "qualityStatus",
      "references",
      "resolution",
      "reviewStatus",
      "scene",
      "scope",
      "seed",
      "sounds",
      "sources",
      "speech",
      "status",
      "style",
      "tags",
      "targetFps",
      "targetResolution",
      "text",
      "training",
      "transformations",
      "useTemplate",
      "version",
      "waitForCompletion",
      "width"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VideosController.create",
    "path": "/videos",
    "pathParams": [],
    "queryParams": [],
    "toolName": "videos__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosController.findAll",
    "path": "/videos",
    "pathParams": [],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "reference",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "videos__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosController.findOne",
    "path": "/videos/{videoId}",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosController.getThumbnail",
    "path": "/videos/{videoId}/thumbnail",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [
      "timeInSeconds",
      "width"
    ],
    "toolName": "videos__get_thumbnail"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "VideosController.remove",
    "path": "/videos/{videoId}",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos__remove"
  },
  {
    "bodyFields": [
      "caption",
      "language"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VideosCaptionsController.createVideoWithCaptions",
    "path": "/videos/{videoId}/captions",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_captions__create_video_with_captions"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosCaptionsController.getCaptions",
    "path": "/videos/{videoId}/captions",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "videos_captions__get_captions"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosEditsController.addTextOverlay",
    "path": "/videos/{videoId}/text-overlay",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_edits__add_text_overlay"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosEditsController.trimVideo",
    "path": "/videos/{videoId}/trim",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_edits__trim_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosEffectsController.mirrorVideo",
    "path": "/videos/{videoId}/mirror",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_effects__mirror_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosEffectsController.reverseVideo",
    "path": "/videos/{videoId}/reverse",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_effects__reverse_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosGifController.createGif",
    "path": "/videos/{videoId}/gif",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_gif__create_gif"
  },
  {
    "bodyFields": [
      "parent",
      "voice"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VideosLipSyncController.createLipSyncVideo",
    "path": "/videos/lip-sync",
    "pathParams": [],
    "queryParams": [],
    "toolName": "videos_lip_sync__create_lip_sync_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosProvenanceController.getProvenance",
    "path": "/videos/{videoId}/provenance",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_provenance__get_provenance"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosProvenanceController.getWatermarkEvaluation",
    "path": "/videos/{videoId}/provenance/watermark-evaluation",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_provenance__get_watermark_evaluation"
  },
  {
    "bodyFields": [
      "audioUrl",
      "autoSelectModel",
      "backgroundMusic",
      "blacklist",
      "bookmark",
      "brand",
      "brandingMode",
      "camera",
      "cameraMovement",
      "category",
      "contentRating",
      "duration",
      "endFrame",
      "folder",
      "fontFamily",
      "format",
      "groupId",
      "groupIndex",
      "height",
      "isAudioEnabled",
      "isBrandingEnabled",
      "isDefault",
      "isHighlighted",
      "language",
      "lens",
      "lighting",
      "metadata",
      "metadataId",
      "model",
      "mood",
      "musicVolume",
      "muteVideoAudio",
      "order",
      "outputs",
      "parent",
      "prioritize",
      "prompt",
      "promptTemplate",
      "qualityFeedback",
      "qualityScore",
      "qualityStatus",
      "references",
      "resolution",
      "reviewStatus",
      "scene",
      "scope",
      "seed",
      "sounds",
      "sources",
      "speech",
      "status",
      "style",
      "tags",
      "targetFps",
      "targetResolution",
      "text",
      "training",
      "transformations",
      "useTemplate",
      "version",
      "waitForCompletion",
      "width"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VideosReframeController.reframeVideo",
    "path": "/videos/{videoId}/reframe",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_reframe__reframe_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosRelationshipsController.findAllPosts",
    "path": "/videos/{videoId}/posts",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "reference",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "videos_relationships__find_all_posts"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VideosRelationshipsController.findChildren",
    "path": "/videos/{videoId}/children",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [
      "brand",
      "folder",
      "format",
      "isDeleted",
      "isFavorite",
      "latest",
      "lightweight",
      "limit",
      "organization",
      "page",
      "pagination",
      "parent",
      "provider",
      "reference",
      "scope",
      "search",
      "sort",
      "status",
      "training"
    ],
    "toolName": "videos_relationships__find_children"
  },
  {
    "bodyFields": [
      "category",
      "ids",
      "isCaptionsEnabled",
      "isMuteVideoAudio",
      "isResizeEnabled",
      "isUpscaleEnabled",
      "music",
      "musicVolume",
      "transition",
      "transitionDuration",
      "transitionEaseCurve",
      "zoomConfigs",
      "zoomEaseCurve"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VideosRelationshipsController.mergeVideos",
    "path": "/videos/merge",
    "pathParams": [],
    "queryParams": [],
    "toolName": "videos_relationships__merge_videos"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosResizeController.resizeToPortrait",
    "path": "/videos/{videoId}/portrait",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_resize__resize_to_portrait"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosResizeController.resizeVideo",
    "path": "/videos/{videoId}/resize",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_resize__resize_video"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "VideosUploadController.createUpload",
    "path": "/videos/upload",
    "pathParams": [],
    "queryParams": [],
    "toolName": "videos_upload__create_upload"
  },
  {
    "bodyFields": [
      "brand",
      "model",
      "organization",
      "targetFps",
      "targetResolution"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VideosUpscaleController.upscaleVideo",
    "path": "/videos/{videoId}/upscale",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "videos_upscale__upscale_video"
  },
  {
    "bodyFields": [
      "audioUrl",
      "description",
      "name",
      "provider",
      "removeBackgroundNoise"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VoicesController.cloneVoice",
    "path": "/voices/clone",
    "pathParams": [],
    "queryParams": [],
    "toolName": "voices__clone_voice"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "VoicesController.deleteClonedVoice",
    "path": "/voices/clone/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "voices__delete_cloned_voice"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VoicesController.findAll",
    "path": "/voices",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isActive",
      "isDefault",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "providers",
      "scope",
      "search",
      "sort",
      "status",
      "voiceSource"
    ],
    "toolName": "voices__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VoicesController.findCatalog",
    "path": "/voices/catalog",
    "pathParams": [],
    "queryParams": [
      "provider",
      "search"
    ],
    "toolName": "voices__find_catalog"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "VoicesController.findClonedVoices",
    "path": "/voices/cloned",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isActive",
      "isDefault",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "providers",
      "scope",
      "search",
      "sort",
      "status",
      "voiceSource"
    ],
    "toolName": "voices__find_cloned_voices"
  },
  {
    "bodyFields": [
      "speed",
      "text",
      "voiceId",
      "waitForCompletion"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VoicesController.generate",
    "path": "/voices/generate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "voices__generate"
  },
  {
    "bodyFields": [
      "providers"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VoicesController.importCatalogVoices",
    "path": "/voices/import",
    "pathParams": [],
    "queryParams": [],
    "toolName": "voices__import_catalog_voices"
  },
  {
    "bodyFields": [
      "isActive",
      "isDefaultSelectable",
      "isFeatured"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "VoicesController.patchCatalogVoice",
    "path": "/voices/catalog/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "voices__patch_catalog_voice"
  },
  {
    "bodyFields": [
      "entity",
      "entityModel"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "VotesController.create",
    "path": "/votes",
    "pathParams": [],
    "queryParams": [],
    "toolName": "votes__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "VotesController.remove",
    "path": "/votes",
    "pathParams": [],
    "queryParams": [
      "entity"
    ],
    "toolName": "votes__remove"
  },
  {
    "bodyFields": [],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WatchlistsController.create",
    "path": "/watchlists",
    "pathParams": [],
    "queryParams": [],
    "toolName": "watchlists__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "WatchlistsController.delete",
    "path": "/watchlists/{watchlistId}",
    "pathParams": [
      "watchlistId"
    ],
    "queryParams": [],
    "toolName": "watchlists__delete"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WatchlistsController.findAll",
    "path": "/watchlists",
    "pathParams": [],
    "queryParams": [],
    "toolName": "watchlists__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WatchlistsController.findOne",
    "path": "/watchlists/{watchlistId}",
    "pathParams": [
      "watchlistId"
    ],
    "queryParams": [],
    "toolName": "watchlists__find_one"
  },
  {
    "bodyFields": [
      "isDeleted"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "WatchlistsController.update",
    "path": "/watchlists/{watchlistId}",
    "pathParams": [
      "watchlistId"
    ],
    "queryParams": [],
    "toolName": "watchlists__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WhatsappController.getMessageStatus",
    "path": "/services/whatsapp/status/{messageSid}",
    "pathParams": [
      "messageSid"
    ],
    "queryParams": [
      "brandId"
    ],
    "toolName": "whatsapp__get_message_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WhatsappController.sendMessage",
    "path": "/services/whatsapp/send",
    "pathParams": [],
    "queryParams": [],
    "toolName": "whatsapp__send_message"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WhatsappController.sendTemplateMessage",
    "path": "/services/whatsapp/template",
    "pathParams": [],
    "queryParams": [],
    "toolName": "whatsapp__send_template_message"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WordpressController.createPost",
    "path": "/services/wordpress/posts",
    "pathParams": [],
    "queryParams": [],
    "toolName": "wordpress__create_post"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WordpressController.exchangeToken",
    "path": "/services/wordpress/token",
    "pathParams": [],
    "queryParams": [],
    "toolName": "wordpress__exchange_token"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WordpressController.getAuthUrl",
    "path": "/services/wordpress/auth",
    "pathParams": [],
    "queryParams": [
      "state"
    ],
    "toolName": "wordpress__get_auth_url"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowBatchController.getBatchStatus",
    "path": "/workflows/batch/{batchJobId}",
    "pathParams": [
      "batchJobId"
    ],
    "queryParams": [],
    "toolName": "workflow_batch__get_batch_status"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowBatchController.listBatchJobs",
    "path": "/workflows/batch",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset"
    ],
    "toolName": "workflow_batch__list_batch_jobs"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WorkflowBatchController.runBatch",
    "path": "/workflows/{workflowId}/batch",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_batch__run_batch"
  },
  {
    "bodyFields": [
      "description",
      "targetPlatforms"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowBuilderController.generateWorkflow",
    "path": "/workflows/generate",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_builder__generate_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowBuilderController.getNodeDefinition",
    "path": "/workflows/nodes/{nodeType}",
    "pathParams": [
      "nodeType"
    ],
    "queryParams": [],
    "toolName": "workflow_builder__get_node_definition"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowBuilderController.getNodeRegistry",
    "path": "/workflows/nodes/registry",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_builder__get_node_registry"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowBuilderController.getWorkflowInterface",
    "path": "/workflows/{workflowId}/interface",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_builder__get_workflow_interface"
  },
  {
    "bodyFields": [
      "format",
      "name",
      "workflow"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowBuilderController.importWorkflow",
    "path": "/workflows/import",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_builder__import_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WorkflowBuilderController.validateNodeConnection",
    "path": "/workflows/validate-connection",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_builder__validate_node_connection"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WorkflowBuilderController.validateWorkflow",
    "path": "/workflows/{workflowId}/validate",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_builder__validate_workflow"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WorkflowBuilderController.validateWorkflowReference",
    "path": "/workflows/{workflowId}/validate-reference",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_builder__validate_workflow_reference"
  },
  {
    "bodyFields": [
      "brandId"
    ],
    "bodyRequired": false,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowCrudController.cloneWorkflow",
    "path": "/workflows/{workflowId}/clone",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_crud__clone_workflow"
  },
  {
    "bodyFields": [
      "brandId",
      "brands",
      "completedAt",
      "description",
      "edges",
      "executionCount",
      "inputVariables",
      "isPublic",
      "isScheduleEnabled",
      "isTemplate",
      "label",
      "lastExecutedAt",
      "metadata",
      "nodes",
      "organization",
      "progress",
      "recurrence",
      "schedule",
      "scheduledFor",
      "sourceAsset",
      "startedAt",
      "status",
      "steps",
      "tags",
      "templateId",
      "thumbnail",
      "thumbnailNodeId",
      "timezone",
      "trigger",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowCrudController.create",
    "path": "/workflows",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_crud__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowCrudController.exportComfyUI",
    "path": "/workflows/{workflowId}/export-comfyui",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_crud__export_comfy_ui"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowCrudController.findAll",
    "path": "/workflows",
    "pathParams": [],
    "queryParams": [
      "brand",
      "brandId",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "referencable",
      "sort"
    ],
    "toolName": "workflow_crud__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowCrudController.findOne",
    "path": "/workflows/{workflowId}",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_crud__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowCrudController.getStatistics",
    "path": "/workflows/statistics",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_crud__get_statistics"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "WorkflowCrudController.remove",
    "path": "/workflows/{workflowId}",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_crud__remove"
  },
  {
    "bodyFields": [
      "brandId",
      "brands",
      "completedAt",
      "description",
      "edges",
      "executionCount",
      "inputVariables",
      "isPublic",
      "isScheduleEnabled",
      "isTemplate",
      "label",
      "lastExecutedAt",
      "lifecycle",
      "metadata",
      "nodes",
      "organization",
      "progress",
      "recurrence",
      "schedule",
      "scheduledFor",
      "sourceAsset",
      "startedAt",
      "status",
      "steps",
      "tags",
      "templateId",
      "thumbnail",
      "thumbnailNodeId",
      "timezone",
      "trigger",
      "user"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "WorkflowCrudController.update",
    "path": "/workflows/{workflowId}",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_crud__update"
  },
  {
    "bodyFields": [
      "dryRun",
      "nodeIds",
      "respectLocks"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowExecutionController.executePartial",
    "path": "/workflows/{workflowId}/execute/partial",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_execution__execute_partial"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowExecutionController.getCreditsEstimate",
    "path": "/workflows/{workflowId}/credits-estimate",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [
      "nodeIds"
    ],
    "toolName": "workflow_execution__get_credits_estimate"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowExecutionController.getExecutionLogs",
    "path": "/workflows/{workflowId}/executions/{runId}/logs",
    "pathParams": [
      "runId",
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_execution__get_execution_logs"
  },
  {
    "bodyFields": [
      "lock",
      "unlock"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "WorkflowExecutionController.patchNodes",
    "path": "/workflows/{workflowId}/nodes",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_execution__patch_nodes"
  },
  {
    "bodyFields": [
      "expectedContextVersion",
      "respectLocks",
      "threadId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowExecutionController.resumeExecution",
    "path": "/workflows/{workflowId}/execute/resume/{runId}",
    "pathParams": [
      "runId",
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_execution__resume_execution"
  },
  {
    "bodyFields": [
      "approved",
      "expectedContextVersion",
      "nodeId",
      "rejectionReason",
      "threadId"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowExecutionController.submitApproval",
    "path": "/workflows/{workflowId}/executions/{executionId}/approve",
    "pathParams": [
      "executionId",
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_execution__submit_approval"
  },
  {
    "bodyFields": [
      "expectedContextVersion",
      "inputValues",
      "metadata",
      "threadId",
      "trigger",
      "workflow"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "post",
    "operationId": "WorkflowExecutionsController.create",
    "path": "/workflow-executions",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_executions__create"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowExecutionsController.findAll",
    "path": "/workflow-executions",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "offset",
      "organization",
      "page",
      "pagination",
      "sort",
      "status",
      "trigger",
      "workflow"
    ],
    "toolName": "workflow_executions__find_all"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowExecutionsController.findOne",
    "path": "/workflow-executions/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "workflow_executions__find_one"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowExecutionsController.getExecutionStats",
    "path": "/workflow-executions/workflow/{workflowId}/stats",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_executions__get_execution_stats"
  },
  {
    "bodyFields": [
      "error",
      "status"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "WorkflowExecutionsController.update",
    "path": "/workflow-executions/{id}",
    "pathParams": [
      "id"
    ],
    "queryParams": [],
    "toolName": "workflow_executions__update"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowMarketplaceController.getMarketplace",
    "path": "/workflows/marketplace",
    "pathParams": [],
    "queryParams": [
      "brand",
      "isDeleted",
      "isFavorite",
      "limit",
      "organization",
      "page",
      "pagination",
      "sort"
    ],
    "toolName": "workflow_marketplace__get_marketplace"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowMarketplaceController.getTemplates",
    "path": "/workflows/templates",
    "pathParams": [],
    "queryParams": [],
    "toolName": "workflow_marketplace__get_templates"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "delete",
    "operationId": "WorkflowWebhookManagementController.deleteWebhook",
    "path": "/workflows/{workflowId}/webhook",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_webhook_management__delete_webhook"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "WorkflowWebhookManagementController.generateWebhook",
    "path": "/workflows/{workflowId}/webhook",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_webhook_management__generate_webhook"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "WorkflowWebhookManagementController.getWebhookInfo",
    "path": "/workflows/{workflowId}/webhook",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_webhook_management__get_webhook_info"
  },
  {
    "bodyFields": [
      "rotateSecret"
    ],
    "bodyRequired": true,
    "bodyStyle": "properties",
    "method": "patch",
    "operationId": "WorkflowWebhookManagementController.patchWebhook",
    "path": "/workflows/{workflowId}/webhook",
    "pathParams": [
      "workflowId"
    ],
    "queryParams": [],
    "toolName": "workflow_webhook_management__patch_webhook"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "YoutubeController.connect",
    "path": "/services/youtube/connect",
    "pathParams": [],
    "queryParams": [],
    "toolName": "youtube__connect"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "YoutubeController.getTrends",
    "path": "/services/youtube/trends",
    "pathParams": [],
    "queryParams": [],
    "toolName": "youtube__get_trends"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "get",
    "operationId": "YoutubeController.getVideoMetadata",
    "path": "/services/youtube/metadata/{videoId}",
    "pathParams": [
      "videoId"
    ],
    "queryParams": [],
    "toolName": "youtube__get_video_metadata"
  },
  {
    "bodyFields": [],
    "bodyRequired": false,
    "bodyStyle": "none",
    "method": "post",
    "operationId": "YoutubeController.verify",
    "path": "/services/youtube/verify",
    "pathParams": [],
    "queryParams": [],
    "toolName": "youtube__verify"
  }
];
