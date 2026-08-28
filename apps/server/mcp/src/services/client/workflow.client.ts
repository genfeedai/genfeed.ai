import type { WorkflowTemplateResource } from '@mcp/shared/interfaces/api-response.interface';
import type {
  SystemWorkflowCatalogEntry,
  SystemWorkflowCatalogListParams,
  SystemWorkflowInstallParams,
  WorkflowCreateParams,
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
  return String(resource?.id ?? attrs.id ?? '');
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
    timezone: asString(attrs.timezone),
    updatedAt: asString(attrs.updatedAt),
    version: asNumber(attrs.version),
    versionId: asString(attrs.versionId),
  };
}

function mapSystemWorkflowCatalogEntry(
  entry: Record<string, unknown>,
): SystemWorkflowCatalogEntry {
  return {
    canonicalId: asString(entry.canonicalId) ?? '',
    category: asString(entry.category),
    description: asString(entry.description),
    family: asString(entry.family) ?? 'product',
    installable: entry.installable !== false,
    installed: entry.installed === true,
    installedWorkflowId: asString(entry.installedWorkflowId),
    isScheduleEnabled:
      typeof entry.isScheduleEnabled === 'boolean'
        ? entry.isScheduleEnabled
        : undefined,
    label: asString(entry.label) ?? asString(entry.canonicalId) ?? 'Untitled',
    schedule: asString(entry.schedule),
    timezone: asString(entry.timezone),
    version: asNumber(entry.version),
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
    workflowId: asString(attrs.workflowId),
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
              edges: params.edges,
              inputVariables: params.inputVariables,
              name: params.name,
              nodes: params.nodes,
              schedule: params.schedule,
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
          nodeCount: Array.isArray(workflow?.attributes?.nodes)
            ? workflow.attributes.nodes.length
            : 0,
          status: workflow?.attributes?.status || CONTENT_STATUS.DRAFT,
          updatedAt: workflow?.attributes?.updatedAt,
          version: workflow?.attributes?.version,
          versionId: workflow?.attributes?.versionId,
        };
      },
      this.base.failWithDetail('Failed to create workflow'),
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
        const response = await http.post('/workflows', {
          sourceWorkflowId: workflowId,
        });
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

        if (params.workflowId) queryParams.workflowId = params.workflowId;
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

  /**
   * Lists the code-owned system workflow catalog. Same collection resource as
   * workflows — the catalog is a query filter, not a parallel path (#2176).
   */
  listSystemWorkflowCatalog(
    params: SystemWorkflowCatalogListParams = {},
  ): Promise<SystemWorkflowCatalogEntry[]> {
    this.base.logger.debug('Listing system workflow catalog', { params });

    return this.base.request(
      'listing system workflow catalog',
      async (http) => {
        const response = await http.get('/workflows', {
          params: { source: 'system-catalog' },
        });

        const entries = asArray(response.data?.data).map((entry) =>
          mapSystemWorkflowCatalogEntry(asRecord(entry)),
        );

        return entries
          .filter((entry) => params.includeNonInstallable || entry.installable)
          .filter((entry) => !params.family || entry.family === params.family)
          .filter((entry) => !params.installedOnly || entry.installed);
      },
      this.base.failWithDetail('Failed to list system workflow catalog'),
    );
  }

  /**
   * Installs one catalog entry as an editable org-owned workflow. The API is
   * idempotent, so a repeat install returns the existing workflow.
   */
  installSystemWorkflow(
    params: SystemWorkflowInstallParams,
  ): Promise<WorkflowResponse> {
    this.base.logger.debug('Installing system workflow', { params });

    return this.base.request(
      'installing system workflow',
      async (http) => {
        const response = await http.post('/workflows', {
          brandId: params.brandId,
          sourceType: 'system-catalog',
          templateId: params.canonicalId,
        });
        return mapWorkflowResource(
          this.base.unwrapData<JsonApiResource>(response),
        );
      },
      this.base.failWithDetail('Failed to install system workflow'),
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
            nodeCount: Array.isArray(template.attributes?.nodes)
              ? template.attributes.nodes.length
              : 0,
          })) || []
        );
      },
      this.base.failWith('Failed to list workflow templates'),
    );
  }
}
