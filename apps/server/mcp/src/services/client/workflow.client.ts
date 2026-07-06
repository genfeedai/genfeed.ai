import type { WorkflowTemplateResource } from '@mcp/shared/interfaces/api-response.interface';
import type {
  WorkflowCreateParams,
  WorkflowExecuteParams,
  WorkflowExecutionResult,
  WorkflowListParams,
  WorkflowResponse,
  WorkflowRunListParams,
  WorkflowRunResponse,
  WorkflowScheduleParams,
  WorkflowScheduleResponse,
  WorkflowTemplate,
} from '@mcp/shared/interfaces/workflow.interface';
import type { BaseApiClient } from './base-api-client';
import { CONTENT_STATUS, type JsonApiResource } from './client.types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function resourceId(resource: JsonApiResource | undefined): string {
  const attrs = asRecord(resource?.attributes);
  return String(resource?.id ?? attrs.id ?? attrs._id ?? '');
}

function mapWorkflowResource(
  resource: JsonApiResource | undefined,
): WorkflowResponse {
  const attrs = asRecord(resource?.attributes);
  const nodes = asArray(attrs.nodes);
  const edges = asArray(attrs.edges);
  const status = asString(attrs.status) ?? CONTENT_STATUS.DRAFT;

  return {
    createdAt: asString(attrs.createdAt) ?? new Date().toISOString(),
    currentStepIndex: asNumber(attrs.currentStepIndex),
    description: asString(attrs.description),
    edgeCount: edges.length,
    id: resourceId(resource),
    inputVariables: asArray(attrs.inputVariables) as Array<
      Record<string, unknown>
    >,
    isScheduleEnabled:
      typeof attrs.isScheduleEnabled === 'boolean'
        ? attrs.isScheduleEnabled
        : undefined,
    lastRunAt: asString(attrs.lastRunAt),
    lifecycle: asString(attrs.lifecycle),
    metadata: asRecord(attrs.metadata),
    name: asString(attrs.name) ?? asString(attrs.label) ?? 'Untitled workflow',
    nextRunAt: asString(attrs.nextRunAt),
    nodeCount: nodes.length,
    schedule: asString(attrs.schedule),
    status: status as WorkflowResponse['status'],
    steps: asArray(attrs.steps) as WorkflowResponse['steps'],
    timezone: asString(attrs.timezone),
    updatedAt: asString(attrs.updatedAt),
  };
}

function mapWorkflowRunResource(
  resource: JsonApiResource | undefined,
): WorkflowRunResponse {
  const attrs = asRecord(resource?.attributes);

  return {
    completedAt: asString(attrs.completedAt),
    createdAt: asString(attrs.createdAt),
    durationMs: asNumber(attrs.durationMs),
    error: asString(attrs.error),
    id: resourceId(resource),
    metadata: asRecord(attrs.metadata),
    nodeResults: asArray(attrs.nodeResults),
    progress: asNumber(attrs.progress),
    startedAt: asString(attrs.startedAt),
    status: asString(attrs.status),
    trigger: asString(attrs.trigger),
    updatedAt: asString(attrs.updatedAt),
    workflow: attrs.workflow,
  };
}

/** Workflow authoring, execution, and template discovery. */
export class WorkflowClient {
  constructor(private readonly base: BaseApiClient) {}

  createWorkflow(params: WorkflowCreateParams): Promise<WorkflowResponse> {
    this.base.logger.debug('Creating workflow', { params });

    return this.base.request(
      'creating workflow',
      async (http) => {
        const response = await http.post('/workflows', {
          data: {
            attributes: {
              description: params.description,
              name: params.name,
              schedule: params.schedule,
              steps: params.steps,
              templateId: params.templateId,
            },
            type: 'workflows',
          },
        });

        const workflow = response.data?.data ?? {};
        return {
          createdAt:
            workflow?.attributes?.createdAt || new Date().toISOString(),
          description: workflow?.attributes?.description || params.description,
          id: workflow?.id || workflow?.attributes?.id,
          lastRunAt: workflow?.attributes?.lastRunAt,
          name: workflow?.attributes?.name || params.name,
          nextRunAt: workflow?.attributes?.nextRunAt,
          status: workflow?.attributes?.status || CONTENT_STATUS.DRAFT,
          steps: workflow?.attributes?.steps || params.steps || [],
          updatedAt: workflow?.attributes?.updatedAt,
        };
      },
      this.base.failWithDetail('Failed to create workflow'),
    );
  }

  executeWorkflow(
    params: WorkflowExecuteParams,
  ): Promise<WorkflowExecutionResult> {
    this.base.logger.debug('Executing workflow', { params });

    return this.base.request(
      'executing workflow',
      async (http) => {
        const response = await http.post('/workflow-executions', {
          inputValues: params.variables,
          workflow: params.workflowId,
        });

        const execution = response.data?.data;
        return {
          completedAt: execution?.attributes?.completedAt,
          error: execution?.attributes?.error,
          executionId: execution?.id || execution?.attributes?.id,
          results: execution?.attributes?.results,
          startedAt:
            execution?.attributes?.startedAt || new Date().toISOString(),
          status: execution?.attributes?.status || CONTENT_STATUS.STARTED,
          workflowId: params.workflowId,
        };
      },
      this.base.failWithDetail('Failed to execute workflow'),
    );
  }

  getWorkflowStatus(workflowId: string): Promise<WorkflowResponse> {
    this.base.logger.debug(`Getting workflow status for ID: ${workflowId}`);

    return this.base.request(
      'getting workflow status',
      async (http) => {
        const response = await http.get(`/workflows/${workflowId}`);
        const workflow = response.data?.data;

        return mapWorkflowResource(workflow);
      },
      this.base.failWith('Failed to get workflow status'),
    );
  }

  inspectWorkflow(workflowId: string): Promise<WorkflowResponse> {
    this.base.logger.debug(`Inspecting workflow ID: ${workflowId}`);

    return this.base.request(
      'inspecting workflow',
      async (http) => {
        const response = await http.get(
          `/workflows/${encodeURIComponent(workflowId)}`,
        );
        return mapWorkflowResource(
          this.base.unwrapData<JsonApiResource>(response),
        );
      },
      this.base.failWithDetail('Failed to inspect workflow'),
    );
  }

  duplicateWorkflow(workflowId: string): Promise<WorkflowResponse> {
    this.base.logger.debug(`Duplicating workflow ID: ${workflowId}`);

    return this.base.request(
      'duplicating workflow',
      async (http) => {
        const response = await http.post(
          `/workflows/${encodeURIComponent(workflowId)}/clone`,
        );
        return mapWorkflowResource(
          this.base.unwrapData<JsonApiResource>(response),
        );
      },
      this.base.failWithDetail('Failed to duplicate workflow'),
    );
  }

  setWorkflowSchedule(
    workflowId: string,
    params: WorkflowScheduleParams,
  ): Promise<WorkflowScheduleResponse> {
    this.base.logger.debug(`Updating workflow schedule for ID: ${workflowId}`, {
      params,
    });

    return this.base.request(
      'updating workflow schedule',
      async (http) => {
        if (params.enabled !== false && !params.schedule) {
          throw new Error('schedule is required when enabling a workflow');
        }

        const response = await http.patch(
          `/workflows/${encodeURIComponent(workflowId)}`,
          params.enabled === false && !params.schedule
            ? {
                isScheduleEnabled: false,
                schedule: null,
              }
            : {
                isScheduleEnabled: params.enabled,
                schedule: params.schedule,
                timezone: params.timezone ?? 'UTC',
              },
        );
        const workflow = mapWorkflowResource(
          this.base.unwrapData<JsonApiResource>(response),
        );
        return {
          enabled: workflow.isScheduleEnabled ?? params.enabled,
          id: workflow.id || workflowId,
          schedule: workflow.schedule,
          timezone: workflow.timezone,
        };
      },
      this.base.failWithDetail('Failed to update workflow schedule'),
    );
  }

  listWorkflows(params: WorkflowListParams = {}): Promise<WorkflowResponse[]> {
    this.base.logger.debug('Listing workflows', { params });

    return this.base.request(
      'listing workflows',
      async (http) => {
        const queryParams: Record<string, string | number> = {
          'page[limit]': params.limit || 10,
          'page[offset]': params.offset || 0,
        };

        if (params.status) {
          queryParams['filter[status]'] = params.status;
        }

        const response = await http.get('/workflows', {
          params: queryParams,
        });

        return (
          response.data?.data?.map((workflow: JsonApiResource) =>
            mapWorkflowResource(workflow),
          ) || []
        );
      },
      this.base.failWith('Failed to list workflows'),
    );
  }

  listWorkflowRuns(
    params: WorkflowRunListParams = {},
  ): Promise<WorkflowRunResponse[]> {
    this.base.logger.debug('Listing workflow runs', { params });

    return this.base.request(
      'listing workflow runs',
      async (http) => {
        const queryParams: Record<string, string | number> = {
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
        };

        if (params.workflowId) queryParams.workflow = params.workflowId;
        if (params.status) queryParams.status = params.status;
        if (params.trigger) queryParams.trigger = params.trigger;

        const response = await http.get('/workflow-executions', {
          params: queryParams,
        });

        return this.base
          .unwrapList<JsonApiResource>(response)
          .map(mapWorkflowRunResource);
      },
      this.base.failWithDetail('Failed to list workflow runs'),
    );
  }

  getWorkflowRun(runId: string): Promise<WorkflowRunResponse> {
    this.base.logger.debug(`Getting workflow run ID: ${runId}`);

    return this.base.request(
      'getting workflow run',
      async (http) => {
        const response = await http.get(
          `/workflow-executions/${encodeURIComponent(runId)}`,
        );
        return mapWorkflowRunResource(
          this.base.unwrapData<JsonApiResource>(response),
        );
      },
      this.base.failWithDetail('Failed to get workflow run'),
    );
  }

  listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    this.base.logger.debug('Listing workflow templates');

    return this.base.request(
      'listing workflow templates',
      async (http) => {
        const response = await http.get('/workflows/templates');

        return (
          response.data?.data?.map((template: WorkflowTemplateResource) => ({
            category: template.attributes?.category || 'general',
            creditsRequired: template.attributes?.creditsRequired,
            description:
              template.attributes?.description || 'No description available',
            estimatedDuration: template.attributes?.estimatedDuration,
            id: template.id,
            name: template.attributes?.name,
            steps: template.attributes?.steps || [],
          })) || []
        );
      },
      this.base.failWith('Failed to list workflow templates'),
    );
  }
}
