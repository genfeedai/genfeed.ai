import { WorkflowLifecycle } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IPaginationParams } from '@genfeedai/contracts/interfaces';
import { getSystemWorkflowMetadata } from '@genfeedai/contracts/interfaces';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import type {
  ApprovalResponse,
  BrandSummary,
  CloudWorkflowData,
  CreateWorkflowInput,
  ExecuteOptions,
  ExecutionResult,
  ListExecutionsParams,
  ResumeExecutionResult,
  SystemWorkflowCatalogEntry,
  UpdateWorkflowInput,
  WebhookInfo,
  WebhookSecretResponse,
  WorkflowActionContext,
  WorkflowScheduleInput,
  WorkflowSummary,
  WorkflowTemplate,
} from './workflow-api.types';

export type * from './workflow-api.types';

export function isCanonicalSystemWorkflow(workflow: {
  metadata?: unknown;
}): boolean {
  return getSystemWorkflowMetadata(workflow.metadata)?.immutable === true;
}

// =============================================================================
// WORKFLOW API SERVICE
// =============================================================================

/**
 * Cloud API service for visual workflow editor operations.
 *
 * Extends HTTPBaseService which provides:
 * - Automatic Bearer token injection via the active auth provider
 * - Request/response interceptors (timeout, error handling, auth)
 * - Singleton instance management per token
 *
 * Usage with useAuthedService hook:
 * ```
 * const getService = useAuthedService((token) =>
 *   WorkflowApiService.getInstance(
 *     `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.WORKFLOWS}`,
 *     token,
 *   )
 * );
 * const service = await getService();
 * const workflows = await service.list();
 * ```
 */
export class WorkflowApiService extends HTTPBaseService {
  private readonly workflowLifecycles = new Set<CloudWorkflowData['lifecycle']>(
    [
      WorkflowLifecycle.ARCHIVED,
      WorkflowLifecycle.DRAFT,
      WorkflowLifecycle.PUBLISHED,
    ],
  );

  private isJsonApiDocument(
    payload: unknown,
  ): payload is JsonApiResponseDocument {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return 'data' in payload;
  }

  private isJsonApiResourceDocument(
    payload: unknown,
  ): payload is JsonApiResponseDocument {
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      return false;
    }

    const data = (payload as { data?: unknown }).data;
    return Boolean(data && typeof data === 'object' && 'type' in data);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /** List one page of workflows for the current organization */
  async listPage(params?: Record<string, unknown>): Promise<{
    items: WorkflowSummary[];
    pagination: IPaginationParams;
  }> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>('', {
        params,
      });
      const items = deserializeCollection<WorkflowSummary>(response.data);
      const pagination = response.data.links?.pagination;

      return {
        items,
        pagination: {
          limit: pagination?.limit ?? items.length,
          page: pagination?.page ?? 1,
          pages: pagination?.pages ?? 1,
          total: pagination?.total ?? items.length,
        },
      };
    } catch (error) {
      logger.error('Failed to list workflows', { error });
      throw error;
    }
  }

  /** List workflows for the current organization */
  async list(params?: Record<string, unknown>): Promise<WorkflowSummary[]> {
    const page = await this.listPage(params);
    return page.items;
  }

  /** Get a single workflow by ID */
  async get(id: string): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>(
        `/${id}`,
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to get workflow', { error, workflowId: id });
      throw error;
    }
  }

  /** Create a new workflow */
  async create(data: CreateWorkflowInput): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        '',
        data,
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to create workflow', { error });
      throw error;
    }
  }

  /** Update an existing workflow */
  async update(
    id: string,
    data: UpdateWorkflowInput,
  ): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        data,
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to update workflow', { error, workflowId: id });
      throw error;
    }
  }

  async setThumbnail(
    id: string,
    thumbnailUrl: string,
    nodeId: string,
  ): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        {
          thumbnail: thumbnailUrl,
          thumbnailNodeId: nodeId,
        },
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to set workflow thumbnail', {
        error,
        nodeId,
        workflowId: id,
      });
      throw error;
    }
  }

  /** Soft-delete a workflow */
  async remove(id: string): Promise<void> {
    try {
      await this.instance.delete(`/${id}`);
    } catch (error) {
      logger.error('Failed to delete workflow', { error, workflowId: id });
      throw error;
    }
  }

  /**
   * Set, edit, disable, or remove the recurring schedule for a workflow
   * (PATCH /workflows/:id — registers/unregisters the scheduler server-side).
   * Pass `schedule: null` to remove the schedule entirely.
   */
  async updateSchedule(
    id: string,
    body: WorkflowScheduleInput,
  ): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        {
          isScheduleEnabled: body.isScheduleEnabled,
          schedule: body.schedule,
          ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        },
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to update workflow schedule', {
        error,
        workflowId: id,
      });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------

  /** Publish a draft workflow (lifecycle transition, NOT marketplace) */
  async publish(id: string): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        { lifecycle: WorkflowLifecycle.PUBLISHED },
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to publish workflow', { error, workflowId: id });
      throw error;
    }
  }

  /** Archive a workflow */
  async archive(id: string): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        { lifecycle: WorkflowLifecycle.ARCHIVED },
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to archive workflow', { error, workflowId: id });
      throw error;
    }
  }

  /** Duplicate (clone) a workflow via POST /workflows { sourceWorkflowId } */
  async duplicate(
    id: string,
    options?: { brandId?: string | null },
  ): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>('', {
        ...(options?.brandId ? { brandId: options.brandId } : {}),
        sourceWorkflowId: id,
      });
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to duplicate workflow', { error, workflowId: id });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // EXECUTION
  // ---------------------------------------------------------------------------

  /** Execute a workflow (full or partial) */
  async execute(
    id: string,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult> {
    try {
      const execBaseURL = `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.WORKFLOW_EXECUTIONS}`;
      const response = await this.instance.post<unknown>(execBaseURL, {
        inputValues: options?.inputValues ?? {},
        metadata: options?.metadata,
        ...(options?.threadId && options.expectedContextVersion !== undefined
          ? {
              expectedContextVersion: options.expectedContextVersion,
              threadId: options.threadId,
            }
          : {}),
        workflowId: id,
      });

      if (this.isJsonApiResourceDocument(response.data)) {
        return deserializeResource<ExecutionResult>(response.data);
      }

      return response.data as ExecutionResult;
    } catch (error) {
      logger.error('Failed to execute workflow', { error, workflowId: id });
      throw error;
    }
  }

  /** List execution history with optional filters */
  async listExecutions(
    params?: ListExecutionsParams,
  ): Promise<ExecutionResult[]> {
    try {
      const execBaseURL = `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.WORKFLOW_EXECUTIONS}`;
      const response = await this.instance.get<unknown>(execBaseURL, {
        params,
      });

      if (this.isJsonApiDocument(response.data)) {
        return deserializeCollection<ExecutionResult>(response.data);
      }

      return response.data as ExecutionResult[];
    } catch (error) {
      logger.error('Failed to list executions', { error, params });
      throw error;
    }
  }

  /** Get execution details by ID */
  async getExecution(executionId: string): Promise<ExecutionResult> {
    try {
      const execBaseURL = `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.WORKFLOW_EXECUTIONS}`;
      const response = await this.instance.get<unknown>(
        `${execBaseURL}/${executionId}`,
      );

      if (this.isJsonApiDocument(response.data)) {
        return deserializeResource<ExecutionResult>(response.data);
      }

      return response.data as ExecutionResult;
    } catch (error) {
      logger.error('Failed to get execution', { error, executionId });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // WEBHOOKS
  // ---------------------------------------------------------------------------

  /** Generate a webhook URL for a workflow */
  async createWebhook(
    workflowId: string,
    authType: WebhookInfo['authType'] = 'secret',
  ): Promise<WebhookInfo> {
    try {
      const response = await this.instance.post<{ data: WebhookInfo }>(
        `/${workflowId}/webhook`,
        { authType },
      );
      return this.normalizeWebhookInfo(response.data.data);
    } catch (error) {
      logger.error('Failed to create webhook', { error, workflowId });
      throw error;
    }
  }

  /** Get webhook info for a workflow */
  async getWebhook(workflowId: string): Promise<WebhookInfo> {
    try {
      const response = await this.instance.get<{ data: WebhookInfo }>(
        `/${workflowId}/webhook`,
      );
      return this.normalizeWebhookInfo(response.data.data);
    } catch (error) {
      logger.error('Failed to get webhook', { error, workflowId });
      throw error;
    }
  }

  /** Regenerate the webhook secret */
  async regenerateWebhookSecret(
    workflowId: string,
  ): Promise<WebhookSecretResponse> {
    try {
      const response = await this.instance.patch<{
        data: WebhookSecretResponse;
      }>(`/${workflowId}/webhook`, { rotateSecret: true });
      return response.data.data;
    } catch (error) {
      logger.error('Failed to regenerate webhook secret', {
        error,
        workflowId,
      });
      throw error;
    }
  }

  /** Delete a webhook configuration for a workflow */
  async deleteWebhook(workflowId: string): Promise<void> {
    try {
      await this.instance.delete(`/${workflowId}/webhook`);
    } catch (error) {
      logger.error('Failed to delete webhook', { error, workflowId });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // EXECUTION ACTIONS
  // ---------------------------------------------------------------------------

  /** Execute a partial workflow (specific nodes only) */
  async executePartial(
    workflowId: string,
    nodeIds: string[],
  ): Promise<ExecutionResult> {
    try {
      const response = await this.instance.post<unknown>(
        `/${workflowId}/execute/partial`,
        { nodeIds },
      );

      if (this.isJsonApiResourceDocument(response.data)) {
        return deserializeResource<ExecutionResult>(response.data);
      }

      return response.data as ExecutionResult;
    } catch (error) {
      logger.error('Failed to execute partial workflow', {
        error,
        nodeIds,
        workflowId,
      });
      throw error;
    }
  }

  /** Approve or reject a review gate node */
  async submitApproval(
    workflowId: string,
    executionId: string,
    nodeId: string,
    approved: boolean,
    rejectionReason?: string,
    context?: WorkflowActionContext,
  ): Promise<ApprovalResponse> {
    try {
      const response = await this.instance.post<{ data: ApprovalResponse }>(
        `/${workflowId}/executions/${executionId}/approve`,
        {
          approved,
          ...(context ?? {}),
          nodeId,
          rejectionReason,
        },
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to submit approval', {
        error,
        executionId,
        nodeId,
        workflowId,
      });
      throw error;
    }
  }

  /** Resume a failed workflow through the canonical deterministic run path. */
  async resumeExecution(
    workflowId: string,
    executionId: string,
    context?: WorkflowActionContext,
  ): Promise<ResumeExecutionResult> {
    try {
      const response = await this.instance.post<{
        data: ResumeExecutionResult;
      }>(`/${workflowId}/execute/resume/${executionId}`, context ?? {});
      return response.data.data;
    } catch (error) {
      logger.error('Failed to resume workflow execution', {
        error,
        executionId,
        workflowId,
      });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // TEMPLATES
  // ---------------------------------------------------------------------------

  /** List pre-built workflow templates */
  async listTemplates(): Promise<WorkflowTemplate[]> {
    try {
      const response = await this.instance.get<{ data: WorkflowTemplate[] }>(
        '/templates',
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to list workflow templates', { error });
      throw error;
    }
  }

  /**
   * List code-owned system workflow catalog entries for the active org.
   *
   * Contract (plain payload, not JSON:API resources — #2176 / #2259):
   * `GET /workflows?source=system-catalog` → `{ data: SystemWorkflowCatalogEntry[] }`
   * where each item already carries `installed` / `installedWorkflowId` at the
   * top level (not under `attributes`). Do not run this through the JSON:API
   * collection deserializer.
   */
  async listSystemCatalog(): Promise<SystemWorkflowCatalogEntry[]> {
    try {
      const response = await this.instance.get<{
        data: unknown;
      }>('', {
        params: { source: 'system-catalog' },
      });
      return this.normalizeSystemCatalogEntries(response.data.data);
    } catch (error) {
      logger.error('Failed to list system workflow catalog', { error });
      throw error;
    }
  }

  /**
   * Install a system catalog workflow into the organization (#2176).
   * `POST /workflows` with sourceType=system-catalog — idempotent.
   */
  async installSystemCatalog(
    canonicalId: string,
    brandId?: string,
  ): Promise<CloudWorkflowData> {
    try {
      return await this.create({
        ...(brandId ? { brandId } : {}),
        label: canonicalId,
        sourceType: 'system-catalog',
        templateId: canonicalId,
      });
    } catch (error) {
      logger.error('Failed to install system workflow from catalog', {
        canonicalId,
        error,
      });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // BRANDS (for BrandNode)
  // ---------------------------------------------------------------------------

  /** List brands for the current organization */
  async listBrands(): Promise<BrandSummary[]> {
    try {
      const brandsService = BrandsService.getInstance(this.token);
      const brands = await brandsService.findAll();

      return brands.map((brand) => ({
        id: String(brand.id ?? ''),
        label: brand.label ?? 'Untitled Brand',
        logoUrl: brand.logoUrl,
        primaryColor: brand.primaryColor,
        slug: brand.slug ?? '',
      }));
    } catch (error) {
      logger.error('Failed to list brands', { error });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HELPERS
  // ---------------------------------------------------------------------------

  private normalizeWorkflowData(data: CloudWorkflowData): CloudWorkflowData {
    return {
      ...data,
      edgeStyle:
        typeof data.edgeStyle === 'string' ? data.edgeStyle : 'default',
      edges: Array.isArray(data.edges) ? data.edges : [],
      lifecycle: this.workflowLifecycles.has(data.lifecycle)
        ? data.lifecycle
        : WorkflowLifecycle.DRAFT,
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
    };
  }

  private normalizeWebhookInfo(data: WebhookInfo): WebhookInfo {
    return {
      ...data,
      lastTriggeredAt: data.lastTriggeredAt
        ? new Date(data.lastTriggeredAt).toISOString()
        : null,
    };
  }

  /**
   * Map the plain catalog list payload into a stable client shape.
   * Preserves `installed` / `installedWorkflowId` even if a field is missing
   * or loosely typed at the wire boundary.
   */
  private normalizeSystemCatalogEntries(
    payload: unknown,
  ): SystemWorkflowCatalogEntry[] {
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const canonicalId =
        typeof record.canonicalId === 'string' ? record.canonicalId : '';
      if (!canonicalId) {
        return [];
      }

      const installedWorkflowId =
        typeof record.installedWorkflowId === 'string'
          ? record.installedWorkflowId
          : null;

      return [
        {
          canonicalId,
          category:
            typeof record.category === 'string' ? record.category : 'system',
          changeSummary:
            typeof record.changeSummary === 'string'
              ? record.changeSummary
              : '',
          description:
            typeof record.description === 'string' ? record.description : '',
          family: typeof record.family === 'string' ? record.family : 'product',
          ...(typeof record.icon === 'string' ? { icon: record.icon } : {}),
          installable: record.installable !== false,
          installed: record.installed === true,
          installedWorkflowId,
          isScheduleEnabled: record.isScheduleEnabled === true,
          label: typeof record.label === 'string' ? record.label : canonicalId,
          ...(typeof record.schedule === 'string'
            ? { schedule: record.schedule }
            : {}),
          sourceIssue:
            typeof record.sourceIssue === 'number' ? record.sourceIssue : 0,
          version: typeof record.version === 'number' ? record.version : 0,
        } satisfies SystemWorkflowCatalogEntry,
      ];
    });
  }

  // ---------------------------------------------------------------------------
  // BATCH WORKFLOW EXECUTION
  // ---------------------------------------------------------------------------

  /** Start one parent workflow execution over multiple ingredients. */
  async startBatchExecution(
    workflowId: string,
    ingredientIds: string[],
  ): Promise<ExecutionResult> {
    const response = await this.instance.post<unknown>(
      `/${workflowId}/executions/batch`,
      { ingredientIds },
    );
    return this.isJsonApiResourceDocument(response.data)
      ? deserializeResource<ExecutionResult>(response.data)
      : (response.data as ExecutionResult);
  }
}

// =============================================================================
// FACTORY HELPER
// =============================================================================

/**
 * Creates a WorkflowApiService instance with the standard base URL.
 * Use with useAuthedService:
 *
 * ```
 * const getService = useAuthedService(createWorkflowApiService);
 * ```
 */
export function createWorkflowApiService(token: string): WorkflowApiService {
  return WorkflowApiService.getBaseServiceInstance(
    WorkflowApiService,
    `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.WORKFLOWS}`,
    token,
  );
}
