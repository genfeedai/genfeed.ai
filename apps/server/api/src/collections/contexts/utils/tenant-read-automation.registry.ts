import { AgentCampaignsController } from '@api/collections/agent-campaigns/controllers/agent-campaigns.controller';
import { AgentMemoriesController } from '@api/collections/agent-memories/controllers/agent-memories.controller';
import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import { AgentRunsController } from '@api/collections/agent-threads/controllers/agent-runs.controller';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentTransfersController } from '@api/collections/agent-transfers/controllers/agent-transfers.controller';
import { BatchProjectsController } from '@api/collections/batch-projects/controllers/batch-projects.controller';
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { KnowledgeSourcesController } from '@api/collections/contexts/controllers/knowledge-sources.controller';
import { KnowledgeSpacesController } from '@api/collections/contexts/controllers/knowledge-spaces.controller';
import { EvaluationsController } from '@api/collections/evaluations/controllers/evaluations.controller';
import { HarnessProfilesController } from '@api/collections/harness-profiles/controllers/harness-profiles.controller';
import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { TaskCommentsController } from '@api/collections/task-comments/controllers/task-comments.controller';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { WorkspaceInboxReadController } from '@api/collections/tasks/controllers/workspace-inbox-read.controller';
import { TrainingsOperationsController } from '@api/collections/trainings/controllers/operations/trainings-operations.controller';
import { TrainingsController } from '@api/collections/trainings/controllers/trainings.controller';
import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowBuilderController } from '@api/collections/workflows/controllers/workflow-builder.controller';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';
import { WorkflowMarketplaceController } from '@api/collections/workflows/controllers/workflow-marketplace.controller';
import { WorkflowWebhookManagementController } from '@api/collections/workflows/controllers/workflow-webhook-management.controller';
import { AgentBrandContextController } from '@api/services/agent-orchestrator/agent-brand-context.controller';
import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import { AgentThreadRuntimeController } from '@api/services/agent-threading/controllers/agent-thread-runtime.controller';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { GenerationHarnessController } from '@api/services/harness/generation-harness.controller';
import { AgentWorkflowsController } from '@api/workflows/agent-workflows.controller';

export const TENANT_READ_AUTOMATION_ROUTES = [
  {
    controller: AgentCampaignsController,
    handler: 'getCampaignStatus',
    route: '/v1/agent-campaigns/{id}/status',
    policy: 'selected',
  },
  {
    controller: AgentMemoriesController,
    handler: 'list',
    route: '/v1/agent/memories',
    policy: 'owner',
  },
  {
    controller: AgentMemoriesController,
    handler: 'listBrand',
    route: '/v1/agent/memories/brands/{brandId}',
    policy: 'selected',
  },
  {
    controller: AgentMemoriesController,
    handler: 'listOrganization',
    route: '/v1/agent/memories/organization',
    policy: 'selected',
  },
  {
    controller: AgentMemoriesController,
    handler: 'listPersonal',
    route: '/v1/agent/memories/personal',
    policy: 'owner',
  },
  {
    controller: AgentStrategiesController,
    handler: 'listOpportunities',
    route: '/v1/agent-strategies/{id}/opportunities',
    policy: 'mutating',
  },
  {
    controller: AgentStrategiesController,
    handler: 'performanceSnapshot',
    route: '/v1/agent-strategies/{id}/performance-snapshot',
    policy: 'selected',
  },
  {
    controller: AgentStrategiesController,
    handler: 'listReports',
    route: '/v1/agent-strategies/{id}/reports',
    policy: 'selected',
  },
  {
    controller: AgentStrategiesController,
    handler: 'workflowBinding',
    route: '/v1/agent-strategies/{id}/workflow-binding',
    policy: 'selected',
  },
  {
    controller: AgentRunsController,
    handler: 'listRuns',
    route: '/v1/agent/runs',
    policy: 'owner',
  },
  {
    controller: AgentThreadsController,
    handler: 'listThreads',
    route: '/v1/agent/threads',
    policy: 'owner',
  },
  {
    controller: AgentThreadsController,
    handler: 'getThread',
    route: '/v1/agent/threads/{threadId}',
    policy: 'selected',
  },
  {
    controller: AgentThreadsController,
    handler: 'getMessage',
    route: '/v1/agent/threads/{threadId}/messages/{messageId}',
    policy: 'selected',
  },
  {
    controller: AgentThreadsController,
    handler: 'resolveMessageArtifactReferences',
    route:
      '/v1/agent/threads/{threadId}/messages/{messageId}/artifact-references',
    policy: 'selected',
  },
  {
    controller: AgentTransfersController,
    handler: 'list',
    route: '/v1/agent/transfers',
    policy: 'owner',
  },
  {
    controller: AgentTransfersController,
    handler: 'discoverConversations',
    route: '/v1/agent/transfers/conversations',
    policy: 'owner',
  },
  {
    controller: AgentTransfersController,
    handler: 'getOne',
    route: '/v1/agent/transfers/{id}',
    policy: 'owner',
  },
  {
    controller: BatchProjectsController,
    handler: 'findOne',
    route: '/v1/batch-projects/{id}',
    policy: 'mutating',
  },
  {
    controller: ContextsController,
    handler: 'findAll',
    route: '/v1/contexts',
    policy: 'selected',
  },
  {
    controller: ContextsController,
    handler: 'findOne',
    route: '/v1/contexts/{contextId}',
    policy: 'selected',
  },
  {
    controller: ContextsController,
    handler: 'getStats',
    route: '/v1/contexts/{contextId}/stats',
    policy: 'selected',
  },
  {
    controller: KnowledgeSourcesController,
    handler: 'list',
    route: '/v1/knowledge-sources',
    policy: 'selected',
  },
  {
    controller: KnowledgeSourcesController,
    handler: 'eligible',
    route: '/v1/knowledge-sources/eligible-versions',
    policy: 'selected',
  },
  {
    controller: KnowledgeSourcesController,
    handler: 'find',
    route: '/v1/knowledge-sources/{sourceId}',
    policy: 'selected',
  },
  {
    controller: KnowledgeSourcesController,
    handler: 'versions',
    route: '/v1/knowledge-sources/{sourceId}/versions',
    policy: 'selected',
  },
  {
    controller: KnowledgeSourcesController,
    handler: 'receipt',
    route: '/v1/knowledge-sources/{sourceId}/versions/{versionId}',
    policy: 'selected',
  },
  {
    controller: KnowledgeSpacesController,
    handler: 'list',
    route: '/v1/knowledge-spaces',
    policy: 'selected',
  },
  {
    controller: KnowledgeSpacesController,
    handler: 'find',
    route: '/v1/knowledge-spaces/{spaceId}',
    policy: 'selected',
  },
  {
    controller: KnowledgeSpacesController,
    handler: 'memberships',
    route: '/v1/knowledge-spaces/{spaceId}/memberships',
    policy: 'selected',
  },
  {
    controller: EvaluationsController,
    handler: 'getTrends',
    route: '/v1/evaluations/analytics/trends',
    policy: 'selected',
  },
  {
    controller: HarnessProfilesController,
    handler: 'findForBrand',
    route: '/v1/harness-profiles',
    policy: 'selected',
  },
  {
    controller: PersonasContentController,
    handler: 'getPersonaPosts',
    route: '/v1/personas/{id}/posts',
    policy: 'selected',
  },
  {
    controller: PersonasController,
    handler: 'getMentions',
    route: '/v1/personas/mentions',
    policy: 'selected',
  },
  {
    controller: SkillsController,
    handler: 'getSkill',
    route: '/v1/skills/{slug}',
    policy: 'selected',
  },
  {
    controller: TaskCommentsController,
    handler: 'findAll',
    route: '/v1/tasks/{taskId}/comments',
    policy: 'selected',
  },
  {
    controller: TasksController,
    handler: 'findByIdentifier',
    route: '/v1/tasks/by-identifier/{identifier}',
    policy: 'selected',
  },
  {
    controller: TasksController,
    handler: 'findOne',
    route: '/v1/tasks/{id}',
    policy: 'selected',
  },
  {
    controller: TasksController,
    handler: 'findChildren',
    route: '/v1/tasks/{id}/children',
    policy: 'selected',
  },
  {
    controller: WorkspaceInboxReadController,
    handler: 'list',
    route: '/v1/tasks/inbox/read-state',
    policy: 'owner',
  },
  {
    controller: TrainingsOperationsController,
    handler: 'getTrainingImages',
    route: '/v1/trainings/{trainingId}/images',
    policy: 'selected',
  },
  {
    controller: TrainingsOperationsController,
    handler: 'getTrainingSources',
    route: '/v1/trainings/{trainingId}/sources',
    policy: 'selected',
  },
  {
    controller: TrainingsController,
    handler: 'findOne',
    route: '/v1/trainings/{trainingId}',
    policy: 'selected',
  },
  {
    controller: WorkflowExecutionsController,
    handler: 'getExecutionStats',
    route: '/v1/workflow-executions/workflow/{workflowId}/stats',
    policy: 'selected',
  },
  {
    controller: WorkflowExecutionsController,
    handler: 'findOne',
    route: '/v1/workflow-executions/{id}',
    policy: 'selected',
  },
  {
    controller: WorkflowBuilderController,
    handler: 'getWorkflowInterface',
    route: '/v1/workflows/{workflowId}/interface',
    policy: 'selected',
  },
  {
    controller: WorkflowCrudController,
    handler: 'findOne',
    route: '/v1/workflows/{workflowId}',
    policy: 'selected',
  },
  {
    controller: WorkflowCrudController,
    handler: 'exportComfyUI',
    route: '/v1/workflows/{workflowId}/export-comfyui',
    policy: 'owner',
  },
  {
    controller: WorkflowExecutionController,
    handler: 'getCreditsEstimate',
    route: '/v1/workflows/{workflowId}/credits-estimate',
    policy: 'mutating',
  },
  {
    controller: WorkflowExecutionController,
    handler: 'getExecutionLogs',
    route: '/v1/workflows/{workflowId}/executions/{runId}/logs',
    policy: 'selected',
  },
  {
    controller: WorkflowMarketplaceController,
    handler: 'getMostUsed',
    route: '/v1/workflows/most-used',
    policy: 'selected',
  },
  {
    controller: WorkflowWebhookManagementController,
    handler: 'getWebhookInfo',
    route: '/v1/workflows/{workflowId}/webhook',
    policy: 'owner',
  },
  {
    controller: AgentBrandContextController,
    handler: 'getSnapshot',
    route: '/v1/brands/{brandId}/agent-context',
    policy: 'mutating',
  },
  {
    controller: AgentOrchestratorController,
    handler: 'listGoals',
    route: '/v1/agent/goals',
    policy: 'selected',
  },
  {
    controller: AgentOrchestratorController,
    handler: 'getGoal',
    route: '/v1/agent/goals/{goalId}',
    policy: 'mutating',
  },
  {
    controller: AgentThreadRuntimeController,
    handler: 'listEvents',
    route: '/v1/agent/threads/{threadId}/events',
    policy: 'owner',
  },
  {
    controller: AgentThreadRuntimeController,
    handler: 'getSnapshot',
    route: '/v1/agent/threads/{threadId}/snapshot',
    policy: 'mutating',
  },
  {
    controller: AgentThreadRuntimeController,
    handler: 'getWorkObjects',
    route: '/v1/agent/threads/{threadId}/work-objects',
    policy: 'mutating',
  },
  {
    controller: BatchGenerationController,
    handler: 'getBatches',
    route: '/v1/batches',
    policy: 'selected',
  },
  {
    controller: BatchGenerationController,
    handler: 'getBatch',
    route: '/v1/batches/{id}',
    policy: 'selected',
  },
  {
    controller: GenerationHarnessController,
    handler: 'get',
    route: '/v1/generation-harness/settings',
    policy: 'selected',
  },
  {
    controller: AgentWorkflowsController,
    handler: 'getWorkflow',
    route: '/v1/agent-workflows/{workflowId}',
    policy: 'selected',
  },
] as const;
