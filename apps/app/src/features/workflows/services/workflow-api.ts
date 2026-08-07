import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  BatchStatus,
  IngredientStatus,
  WorkflowBatchItemStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/enums';
import { WorkflowLifecycle } from '@genfeedai/enums';
import {
  getSystemWorkflowMetadata,
  type SystemWorkflowDuplicateMetadata,
  type SystemWorkflowMetadata,
} from '@genfeedai/interfaces';
import type { NodeGroup } from '@genfeedai/workflows/ui';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import type { Edge, Node } from '@xyflow/react';

// =============================================================================
// API TYPES
// =============================================================================

/** Full workflow data returned from the cloud API */
export interface WorkflowInputVariable {
  key: string;
  type: string;
  label: string;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  validation?: Record<string, unknown>;
}

export interface CloudWorkflowData {
  id: string;
  label: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
  edgeStyle: string;
  groups?: NodeGroup[];
  inputVariables?: WorkflowInputVariable[];
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  lifecycle: WorkflowLifecycle;
  organizationId: string;
  brandId?: string | null;
  schedule?: string;
  timezone?: string;
  isScheduleEnabled?: boolean;
  createdBy?: string;
  createdAt: string;
  metadata?: WorkflowMetadata;
  updatedAt: string;
}

export type WorkflowMetadata = Record<string, unknown> & {
  duplicatedFromSystemWorkflow?: SystemWorkflowDuplicateMetadata;
  systemWorkflow?: SystemWorkflowMetadata;
};

/** Lightweight workflow summary for list views */
export interface WorkflowSummary {
  id: string;
  label: string;
  description?: string;
  lifecycle: WorkflowLifecycle;
  brandId?: string | null;
  nodeCount: number;
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  updatedAt: string;
  createdAt: string;
  cloudSync?: {
    lastSyncedAt: string;
    remoteId: string;
    syncDirection: 'push' | 'pull';
  } | null;
  metadata?: WorkflowMetadata;
  schedule?: string;
  timezone?: string;
  isScheduleEnabled?: boolean;
}

export function isCanonicalSystemWorkflow(workflow: {
  metadata?: unknown;
}): boolean {
  return getSystemWorkflowMetadata(workflow.metadata)?.immutable === true;
}

/** Payload for PATCH /workflows/:id (schedule fields) */
export interface SetScheduleInput {
  enabled: boolean;
  schedule: string;
  timezone?: string;
}

/** Payload for creating a new workflow */
export interface CreateWorkflowInput {
  label: string;
  description?: string;
  nodes?: Node[];
  edges?: Edge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  brandId?: string | null;
  inputVariables?: WorkflowInputVariable[];
  isScheduleEnabled?: boolean;
  metadata?: Record<string, unknown>;
  schedule?: string;
  /** When `system-catalog`, installs the catalog entry named by `templateId`. */
  sourceType?: 'system-catalog' | 'seeded-template';
  templateId?: string;
  /** Clone an existing workflow via POST /workflows { sourceWorkflowId }. */
  sourceWorkflowId?: string;
  timezone?: string;
  trigger?: string;
}

/** Payload for updating an existing workflow */
export interface UpdateWorkflowInput {
  label?: string;
  description?: string;
  nodes?: Node[];
  edges?: Edge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  brandId?: string | null;
  inputVariables?: WorkflowInputVariable[];
  isScheduleEnabled?: boolean;
  metadata?: Record<string, unknown>;
  schedule?: string;
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  timezone?: string;
}

/** Options for executing a workflow */
export interface ExecuteOptions {
  expectedContextVersion?: number;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  threadId?: string;
}

export interface WorkflowActionContext {
  expectedContextVersion: number;
  threadId: string;
}

export interface ResumeExecutionResult {
  message: string;
  runId: string;
  status: WorkflowExecutionStatus;
}

/** Node-level result within an execution */
export interface ExecutionNodeResult {
  nodeId: string;
  nodeType: string;
  status: WorkflowExecutionStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  creditsUsed?: number;
  progress?: number;
  retryCount?: number;
}

export interface ExecutionEtaMetadata {
  estimatedDurationMs?: number;
  remainingDurationMs?: number;
  etaConfidence?: 'low' | 'medium' | 'high';
  currentPhase?: string;
  startedAt?: string;
  lastEtaUpdateAt?: string;
  actualDurationMs?: number;
  criticalPathNodeIds?: string[];
}

interface ExecutionMetadata extends Record<string, unknown> {
  creditsUsed?: number;
  eta?: ExecutionEtaMetadata;
}

/** Execution result returned from the API */
export interface ExecutionResult {
  id: string;
  workflowId: string;
  workflow?: { id: string; label?: string; description?: string };
  status: WorkflowExecutionStatus;
  trigger: string;
  inputValues?: Record<string, unknown>;
  nodeResults: ExecutionNodeResult[];
  progress: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  creditsUsed?: number;
  failedNodeId?: string | null;
  error?: string;
  metadata?: ExecutionMetadata;
  createdAt: string;
  updatedAt: string;
}

/** Query params for listing executions */
export interface ListExecutionsParams {
  workflowId?: string;
  status?: WorkflowExecutionStatus;
  trigger?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// BATCH WORKFLOW TYPES
// =============================================================================

/** Result of creating a batch workflow run */
export interface BatchRunResult {
  batchJobId: string;
  totalCount: number;
}

interface BatchOutputSummary {
  id: string;
  category: string;
  status?: IngredientStatus;
  ingredientUrl?: string;
  thumbnailUrl?: string;
}

/**
 * Status of a single batch item.
 *
 * `batch_workflow_jobs.items` is a `Json` column, so item statuses stay
 * lowercase — unlike the job's own Prisma-backed `BatchStatus` column.
 */
export interface BatchItemStatus {
  id: string;
  ingredientId: string;
  status: WorkflowBatchItemStatus;
  executionId?: string;
  outputIngredientId?: string;
  outputCategory?: string;
  outputSummary?: BatchOutputSummary;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Full batch job status with items */
export interface BatchJobStatus {
  id: string;
  workflowId: string;
  status: BatchStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  items: BatchItemStatus[];
  createdAt?: string;
  updatedAt?: string;
}

/** Batch job summary for list view */
export interface BatchJobSummary {
  id: string;
  workflowId: string;
  status: BatchStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  createdAt?: string;
}

/** System catalog entry from GET /workflows?source=system-catalog (#2176) */
export interface SystemWorkflowCatalogEntry {
  canonicalId: string;
  category: string;
  changeSummary: string;
  description: string;
  family: string;
  icon?: string;
  installable: boolean;
  installed: boolean;
  installedWorkflowId: string | null;
  isScheduleEnabled: boolean;
  label: string;
  schedule?: string;
  sourceIssue: number;
  version: number;
}

/** Workflow template returned from GET /workflows/templates */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  isScheduleEnabled?: boolean;
  inputVariables?: WorkflowInputVariable[];
  routine?: {
    cadence: 'daily';
    inputContract: Array<{
      defaultValue?: unknown;
      description?: string;
      key: string;
      label: string;
      required: boolean;
      type: 'boolean' | 'number' | 'select' | 'text';
    }>;
    kind: 'productized-daily-routine';
    outputDestinations: Array<{
      key: string;
      label: string;
      required: boolean;
      type: 'email' | 'social_publish' | 'task' | 'workflow_output';
    }>;
    parentIssue: number;
    recommendedSkills: string[];
    requiredSkills: string[];
    reviewDefaults: {
      autoApproveIfNoResponse: boolean;
      notifyChannels: string[];
      requireApproval: boolean;
      reviewState: 'pending_approval';
      timeoutHours: number;
    };
    sourceIssue: number;
    trackingTasks: Array<{
      description: string;
      key: string;
      outputType: 'newsletter' | 'post';
      priority: 'critical' | 'high' | 'low' | 'medium';
      reviewState: 'pending_approval';
      status: 'in_review' | 'todo';
      title: string;
    }>;
    version: number;
  };
  schedule?: string;
  nodes?: Node[];
  edges?: Edge[];
  steps: Array<{
    id: string;
    name: string;
    category: string;
    config: Record<string, unknown>;
    dependsOn?: string[];
  }>;
  timezone?: string;
}

/** Webhook info returned from the API */
export interface WebhookInfo {
  webhookId: string | null;
  webhookUrl: string | null;
  webhookSecret?: string | null;
  authType: 'none' | 'secret' | 'bearer';
  triggerCount: number;
  lastTriggeredAt: string | null;
}

/** Execution approval response */
export interface ApprovalResponse {
  executionId: string;
  nodeId: string;
  status: 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
}

export interface WebhookSecretResponse {
  webhookSecret: string;
}

/** Brand summary for BrandNode dropdown */
export interface BrandSummary {
  id: string;
  label: string;
  slug: string;
  logoUrl?: string;
  primaryColor?: string;
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
  private readonly workflowLifecycles = new Set<WorkflowLifecycle>([
    WorkflowLifecycle.ARCHIVED,
    WorkflowLifecycle.DRAFT,
    WorkflowLifecycle.PUBLISHED,
  ]);

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

  /** List all workflows for the current organization */
  async list(params?: Record<string, unknown>): Promise<WorkflowSummary[]> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>('', {
        params,
      });
      return deserializeCollection<WorkflowSummary>(response.data);
    } catch (error) {
      logger.error('Failed to list workflows', { error });
      throw error;
    }
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

  /** Enable or disable the schedule for a workflow (PATCH /workflows/:id) */
  async setSchedule(id: string, body: SetScheduleInput): Promise<void> {
    try {
      await this.instance.patch(`/${id}`, {
        isScheduleEnabled: body.enabled,
        schedule: body.schedule,
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      });
    } catch (error) {
      logger.error('Failed to set workflow schedule', {
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

  /** Start a batch workflow run for multiple ingredients */
  async runBatch(
    workflowId: string,
    ingredientIds: string[],
  ): Promise<BatchRunResult> {
    const response = await this.instance.post<{ data: BatchRunResult }>(
      `/${workflowId}/batch`,
      { ingredientIds },
    );
    return response.data.data;
  }

  /** Get batch job status with all items */
  async getBatchStatus(batchJobId: string): Promise<BatchJobStatus> {
    const response = await this.instance.get<{ data: BatchJobStatus }>(
      `/batch/${batchJobId}`,
    );
    return response.data.data;
  }

  /** List batch jobs */
  async listBatchJobs(limit = 20, offset = 0): Promise<BatchJobSummary[]> {
    const response = await this.instance.get<{ data: BatchJobSummary[] }>(
      '/batch',
      { params: { limit, offset } },
    );
    return response.data.data;
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
