/**
 * Smart Scheduler Service
 * AI-powered content scheduling and automation
 */

import type {
  IAIScheduleRecommendation,
  IAutoPostingRule,
  IBulkScheduleRequest,
  IBulkScheduleResult,
  IContentRepurposing,
  IMultiPlatformWorkflow,
  IScheduleOptimizationRequest,
  ISmartSchedule,
  IWorkflowExecution,
  RepurposeFormat,
} from '@genfeedai/interfaces/automation/smart-scheduler.interface';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

class SmartSchedulerServiceClass {
  private baseURL: string;
  private token: string;

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL;
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    method: HttpMethod,
    body?: unknown,
    errorMessage?: string,
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body && { 'Content-Type': 'application/json' }),
      },
      method,
    });

    if (!response.ok) {
      const error = new Error(errorMessage || `Request failed: ${endpoint}`);
      logger.error(errorMessage || 'Request failed', { endpoint, error });
      throw error;
    }

    return response.json();
  }

  async getOptimalPostingTime(
    request: IScheduleOptimizationRequest,
  ): Promise<IAIScheduleRecommendation> {
    const recommendation = await this.request<IAIScheduleRecommendation>(
      '/automation/schedule/optimize',
      'POST',
      request,
      'Failed to get optimal posting time',
    );
    logger.info('Optimal posting time calculated', {
      confidence: recommendation.confidence,
      recommendedTime: recommendation.recommendedTime,
    });
    return recommendation;
  }

  async createSchedule(data: Partial<ISmartSchedule>): Promise<ISmartSchedule> {
    const schedule = await this.request<ISmartSchedule>(
      '/automation/schedules',
      'POST',
      data,
      'Failed to create schedule',
    );
    logger.info('Schedule created', {
      id: schedule.id,
      scheduledTime: schedule.scheduledTime,
    });
    return schedule;
  }

  async getSchedules(filters?: {
    status?: string;
    brandId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ISmartSchedule[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value.toString());
        }
      });
    }
    const queryString = params.toString();
    const endpoint = queryString
      ? `/automation/schedules?${queryString}`
      : '/automation/schedules';
    return this.request(endpoint, 'GET', undefined, 'Failed to get schedules');
  }

  async updateSchedule(
    id: string,
    updates: Partial<ISmartSchedule>,
  ): Promise<ISmartSchedule> {
    const schedule = await this.request<ISmartSchedule>(
      `/automation/schedules/${id}`,
      'PATCH',
      updates,
      'Failed to update schedule',
    );
    logger.info('Schedule updated', { id });
    return schedule;
  }

  async cancelSchedule(id: string): Promise<void> {
    await this.request(
      `/automation/schedules/${id}/cancel`,
      'POST',
      undefined,
      'Failed to cancel schedule',
    );
    logger.info('Schedule cancelled', { id });
  }

  async bulkSchedule(
    request: IBulkScheduleRequest,
  ): Promise<IBulkScheduleResult> {
    const result = await this.request<IBulkScheduleResult>(
      '/automation/schedules/bulk',
      'POST',
      request,
      'Failed to bulk schedule',
    );
    logger.info('Bulk schedule completed', {
      failed: result.failed,
      scheduled: result.scheduled,
    });
    return result;
  }

  async repurposeContent(params: {
    contentId: string;
    targetFormats: RepurposeFormat[];
    settings?: Partial<IContentRepurposing['settings']>;
  }): Promise<IContentRepurposing> {
    const repurpose = await this.request<IContentRepurposing>(
      '/automation/repurpose',
      'POST',
      params,
      'Failed to repurpose content',
    );
    logger.info('Content repurpose job created', {
      formats: params.targetFormats.length,
      id: repurpose.id,
    });
    return repurpose;
  }

  async getRepurposingStatus(id: string): Promise<IContentRepurposing> {
    return this.request(
      `/automation/repurpose/${id}`,
      'GET',
      undefined,
      'Failed to get repurposing status',
    );
  }

  async createWorkflow(
    data: Partial<IMultiPlatformWorkflow>,
  ): Promise<IMultiPlatformWorkflow> {
    const workflow = await this.request<IMultiPlatformWorkflow>(
      '/automation/workflows',
      'POST',
      data,
      'Failed to create workflow',
    );
    logger.info('Workflow created', { id: workflow.id, name: workflow.name });
    return workflow;
  }

  async getWorkflows(): Promise<IMultiPlatformWorkflow[]> {
    return this.request(
      '/automation/workflows',
      'GET',
      undefined,
      'Failed to get workflows',
    );
  }

  async executeWorkflow(
    workflowId: string,
    input?: Record<string, unknown>,
  ): Promise<IWorkflowExecution> {
    const execution = await this.request<
      IWorkflowExecution | JsonApiResponseDocument
    >(
      '/workflow-executions',
      'POST',
      {
        inputValues: input ?? {},
        workflow: workflowId,
      },
      'Failed to execute workflow',
    );
    const normalizedExecution = this.isJsonApiDocument(execution)
      ? deserializeResource<IWorkflowExecution>(execution)
      : execution;
    logger.info('Workflow execution started', {
      executionId: normalizedExecution.id,
      workflowId,
    });
    return normalizedExecution;
  }

  async getExecutionStatus(executionId: string): Promise<IWorkflowExecution> {
    const execution = await this.request<
      IWorkflowExecution | JsonApiResponseDocument
    >(
      `/workflow-executions/${executionId}`,
      'GET',
      undefined,
      'Failed to get execution status',
    );
    return this.isJsonApiDocument(execution)
      ? deserializeResource<IWorkflowExecution>(execution)
      : execution;
  }

  private isJsonApiDocument(
    value: IWorkflowExecution | JsonApiResponseDocument,
  ): value is JsonApiResponseDocument {
    return (
      typeof value === 'object' &&
      value !== null &&
      'data' in value &&
      !Array.isArray((value as { data?: unknown }).data)
    );
  }

  async createAutoPostingRule(
    data: Partial<IAutoPostingRule>,
  ): Promise<IAutoPostingRule> {
    const rule = await this.request<IAutoPostingRule>(
      '/automation/auto-posting',
      'POST',
      data,
      'Failed to create auto-posting rule',
    );
    logger.info('Auto-posting rule created', { id: rule.id, name: rule.name });
    return rule;
  }

  async getAutoPostingRules(): Promise<IAutoPostingRule[]> {
    return this.request(
      '/automation/auto-posting',
      'GET',
      undefined,
      'Failed to get auto-posting rules',
    );
  }

  async toggleAutoPostingRule(
    id: string,
    enabled: boolean,
  ): Promise<IAutoPostingRule> {
    const rule = await this.request<IAutoPostingRule>(
      `/automation/auto-posting/${id}/toggle`,
      'POST',
      { enabled },
      'Failed to toggle auto-posting rule',
    );
    logger.info('Auto-posting rule toggled', { enabled, id });
    return rule;
  }
}

export class SmartSchedulerService {
  private static instances: Map<string, SmartSchedulerServiceClass> = new Map();

  static getInstance(token: string): SmartSchedulerServiceClass {
    if (!SmartSchedulerService.instances.has(token)) {
      SmartSchedulerService.instances.set(
        token,
        new SmartSchedulerServiceClass(EnvironmentService.getApiUrl(), token),
      );
    }
    return SmartSchedulerService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    SmartSchedulerService.instances.delete(token);
  }
}
