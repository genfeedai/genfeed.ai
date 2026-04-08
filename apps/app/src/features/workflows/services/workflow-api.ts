import { API_ENDPOINTS } from '@genfeedai/constants';
import type { NodeGroup } from '@genfeedai/workflow-ui';
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
export interface CloudWorkflowData {
  _id: string;
  name: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
  edgeStyle: string;
  groups?: NodeGroup[];
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  lifecycle: 'draft' | 'published' | 'archived';
  organization: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight workflow summary for list views */
export interface WorkflowSummary {
  _id: string;
  name: string;
  description?: string;
  lifecycle: 'draft' | 'published' | 'archived';
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
}

/** Payload for creating a new workflow */
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  metadata?: Record<string, unknown>;
  templateId?: string;
  trigger?: string;
}

/** Payload for updating an existing workflow */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: Node[];
  edges?: Edge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  metadata?: Record<string, unknown>;
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
}

/** Options for executing a workflow */
export interface ExecuteOptions {
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Node-level result within an execution */
export interface ExecutionNodeResult {
  nodeId: string;
  nodeType: string;
  status: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  progress?: number;
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

export interface ExecutionMetadata extends Record<string, unknown> {
  creditsUsed?: number;
  eta?: ExecutionEtaMetadata;
}

/** Execution result returned from the API */
export interface ExecutionResult {
  _id: string;
  workflow: string | { _id: string; label?: string; description?: string };
  status: string;
  trigger: string;
  nodeResults: ExecutionNodeResult[];
  progress: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  metadata?: ExecutionMetadata;
  createdAt: string;
  updatedAt: string;
}

/** Query params for listing executions */
export interface ListExecutionsParams {
  workflow?: string;
  status?: string;
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

export interface BatchOutputSummary {
  id: string;
  category: string;
  status?: string;
  ingredientUrl?: string;
  thumbnailUrl?: string;
}

/** Status of a single batch item */
export interface BatchItemStatus {
  _id: string;
  ingredientId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
  _id: string;
  workflowId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalCount: number;
  completedCount: number;
  failedCount: number;
  items: BatchItemStatus[];
  createdAt?: string;
  updatedAt?: string;
}

/** Batch job summary for list view */
export interface BatchJobSummary {
  _id: string;
  workflowId: string;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  createdAt?: string;
}

/** Workflow template returned from GET /workflows/templates */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  inputVariables?: Array<{
    key: string;
    type: string;
    label: string;
    description?: string;
    defaultValue?: unknown;
    required?: boolean;
    validation?: Record<string, unknown>;
  }>;
  nodes?: Node[];
  edges?: Edge[];
  steps: Array<{
    id: string;
    name: string;
    category: string;
    config: Record<string, unknown>;
    dependsOn?: string[];
  }>;
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
  _id: string;
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
 * - Automatic Bearer token injection via Clerk
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
    ['archived', 'draft', 'published'],
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

  /** List all workflows for the current organization */
  async list(params?: Record<string, unknown>): Promise<WorkflowSummary[]> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>('', {
        params,
      });
      const items = deserializeCollection<WorkflowSummary>(response.data);
      return items.map((item) => this.mapLabelToName(this.mapIdField(item)));
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
      // Map frontend 'name' → backend 'label'
      const { name, ...rest } = data;
      const payload = { ...rest, label: name };

      const response = await this.instance.post<JsonApiResponseDocument>(
        '',
        payload,
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
      // Map frontend 'name' → backend 'label'
      const { name, ...rest } = data;
      const payload = {
        ...rest,
        ...(name !== undefined ? { label: name } : {}),
      };

      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        payload,
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
        `/${id}/thumbnail`,
        {
          nodeId,
          thumbnailUrl,
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

  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------

  /** Publish a draft workflow (lifecycle transition, NOT marketplace) */
  async publish(id: string): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${id}/lifecycle/publish`,
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
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${id}/lifecycle/archive`,
      );
      const item = deserializeResource<CloudWorkflowData>(response.data);
      return this.normalizeWorkflowData(item);
    } catch (error) {
      logger.error('Failed to archive workflow', { error, workflowId: id });
      throw error;
    }
  }

  /** Duplicate (clone) a workflow */
  async duplicate(id: string): Promise<CloudWorkflowData> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${id}/clone`,
      );
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
        workflow: id,
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
      const response = await this.instance.post<{
        data: WebhookSecretResponse;
      }>(`/${workflowId}/webhook/regenerate-secret`);
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
  ): Promise<ApprovalResponse> {
    try {
      const response = await this.instance.post<{ data: ApprovalResponse }>(
        `/${workflowId}/executions/${executionId}/approve`,
        { approved, nodeId, rejectionReason },
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

  // ---------------------------------------------------------------------------
  // BRANDS (for BrandNode)
  // ---------------------------------------------------------------------------

  /** List brands for the current organization */
  async listBrands(): Promise<BrandSummary[]> {
    try {
      const brandsService = BrandsService.getInstance(this.token);
      const brands = await brandsService.findAll();

      return brands.map((brand) => ({
        _id: String(brand.id ?? ''),
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

  /**
   * Map JSON:API `id` field to MongoDB `_id` field.
   * The deserializer produces `id` but interfaces expect `_id`.
   */
  private mapIdField<T extends object>(data: T): T {
    if (data && 'id' in data && !('_id' in data)) {
      const { id, ...rest } = data as Record<string, unknown>;
      return { ...rest, _id: id } as T;
    }
    return data;
  }

  /**
   * Map backend `label` field to frontend `name` field.
   * The backend schema uses `label` but the frontend expects `name`.
   */
  private mapLabelToName<T extends object>(data: T): T {
    if (data && 'label' in data && !('name' in data)) {
      return { ...data, name: data.label };
    }
    return data;
  }

  private normalizeWorkflowData(data: CloudWorkflowData): CloudWorkflowData {
    const mapped = this.mapLabelToName(this.mapIdField(data));

    return {
      ...mapped,
      edgeStyle:
        typeof mapped.edgeStyle === 'string' ? mapped.edgeStyle : 'default',
      edges: Array.isArray(mapped.edges) ? mapped.edges : [],
      lifecycle: this.workflowLifecycles.has(mapped.lifecycle)
        ? mapped.lifecycle
        : 'draft',
      nodes: Array.isArray(mapped.nodes) ? mapped.nodes : [],
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
