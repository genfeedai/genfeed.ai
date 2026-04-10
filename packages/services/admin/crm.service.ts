import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type {
  ICrmAlignmentRule,
  ICrmAlignmentSummary,
  ICrmAlignmentValidation,
  ICrmAnalytics,
  ICrmCompany,
  ICrmLead,
  ICrmLeadActivity,
  ICrmTask,
  IMarginSummary,
  IMonthlyMargin,
  IProactivePreparationStatus,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class AdminCrmService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/crm`, token);
  }

  public static getInstance(token: string): AdminCrmService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminCrmService,
      token,
    ) as AdminCrmService;
  }

  // === Leads ===

  async getLeads(status?: string): Promise<ICrmLead[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/leads',
      {
        params: status ? { status } : {},
      },
    );
    return deserializeCollection<ICrmLead>(response.data);
  }

  async getLead(id: string): Promise<ICrmLead> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/leads/${id}`,
    );
    return deserializeResource<ICrmLead>(response.data);
  }

  async createLead(data: Partial<ICrmLead>): Promise<ICrmLead> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/leads',
      data,
    );
    return deserializeResource<ICrmLead>(response.data);
  }

  async updateLead(id: string, data: Partial<ICrmLead>): Promise<ICrmLead> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/leads/${id}`,
      data,
    );
    return deserializeResource<ICrmLead>(response.data);
  }

  async deleteLead(id: string): Promise<ICrmLead> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/leads/${id}`,
    );
    return deserializeResource<ICrmLead>(response.data);
  }

  // === Lead Activities ===

  async getLeadActivities(leadId: string): Promise<ICrmLeadActivity[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/leads/${leadId}/activities`,
    );
    return deserializeCollection<ICrmLeadActivity>(response.data);
  }

  async createLeadActivity(
    leadId: string,
    data: { type: string; description: string },
  ): Promise<ICrmLeadActivity> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/leads/${leadId}/activities`,
      data,
    );
    return deserializeResource<ICrmLeadActivity>(response.data);
  }

  // === Companies ===

  async getCompanies(): Promise<ICrmCompany[]> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/companies');
    return deserializeCollection<ICrmCompany>(response.data);
  }

  async getCompany(id: string): Promise<ICrmCompany> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/companies/${id}`,
    );
    return deserializeResource<ICrmCompany>(response.data);
  }

  async createCompany(data: Partial<ICrmCompany>): Promise<ICrmCompany> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/companies',
      data,
    );
    return deserializeResource<ICrmCompany>(response.data);
  }

  async updateCompany(
    id: string,
    data: Partial<ICrmCompany>,
  ): Promise<ICrmCompany> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/companies/${id}`,
      data,
    );
    return deserializeResource<ICrmCompany>(response.data);
  }

  // === Tasks ===

  async getTasks(filters?: {
    status?: string;
    priority?: string;
  }): Promise<ICrmTask[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/tasks',
      {
        params: filters,
      },
    );
    return deserializeCollection<ICrmTask>(response.data);
  }

  async createTask(data: Partial<ICrmTask>): Promise<ICrmTask> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/tasks',
      data,
    );
    return deserializeResource<ICrmTask>(response.data);
  }

  async updateTask(id: string, data: Partial<ICrmTask>): Promise<ICrmTask> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/tasks/${id}`,
      data,
    );
    return deserializeResource<ICrmTask>(response.data);
  }

  async deleteTask(id: string): Promise<ICrmTask> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/tasks/${id}`,
    );
    return deserializeResource<ICrmTask>(response.data);
  }

  // === Financial ===

  async getMarginSummary(): Promise<IMarginSummary> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/margins/summary');
    return deserializeResource<IMarginSummary>(response.data);
  }

  async getMonthlyMargins(year: number): Promise<IMonthlyMargin[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/margins/monthly',
      {
        params: { year },
      },
    );
    return deserializeCollection<IMonthlyMargin>(response.data);
  }

  async getMargins(): Promise<IMarginSummary> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/margins');
    return deserializeResource<IMarginSummary>(response.data);
  }

  // === Proactive Onboarding ===

  async prepareBrand(
    leadId: string,
    data: {
      brandUrl: string;
      brandName?: string;
      industry?: string;
      targetAudience?: string;
    },
  ): Promise<{ success: boolean; brandId: string; organizationId: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/leads/${leadId}/prepare-brand`,
      data,
    );
    return deserializeResource<{
      success: boolean;
      brandId: string;
      organizationId: string;
    }>(response.data);
  }

  async generateContent(
    leadId: string,
    data?: {
      count?: number;
      platforms?: string[];
      topics?: string[];
      contentMix?: string;
    },
  ): Promise<{ success: boolean; batchId: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/leads/${leadId}/generate-content`,
      data || {},
    );
    return deserializeResource<{ success: boolean; batchId: string }>(
      response.data,
    );
  }

  async sendInvitation(
    leadId: string,
    data?: { customMessage?: string },
  ): Promise<{ success: boolean; invitedAt: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/leads/${leadId}/send-invitation`,
      data || {},
    );
    return deserializeResource<{ success: boolean; invitedAt: string }>(
      response.data,
    );
  }

  async getPreparationStatus(
    leadId: string,
  ): Promise<IProactivePreparationStatus> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/leads/${leadId}/preparation-status`,
    );
    return deserializeResource<IProactivePreparationStatus>(response.data);
  }

  async reviewContent(leadId: string): Promise<{ posts: unknown[] }> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/leads/${leadId}/review-content`,
    );
    return deserializeResource<{ posts: unknown[] }>(response.data);
  }

  // === Analytics ===

  async getAnalytics(days: number): Promise<ICrmAnalytics> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/analytics',
      {
        params: { days },
      },
    );
    return deserializeResource<ICrmAnalytics>(response.data);
  }

  // === Alignment ===

  async getAlignmentRules(): Promise<ICrmAlignmentRule[]> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/alignment/rules');
    return deserializeCollection<ICrmAlignmentRule>(response.data);
  }

  async createAlignmentRule(
    data: Partial<ICrmAlignmentRule>,
  ): Promise<ICrmAlignmentRule> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/alignment/rules',
      data,
    );
    return deserializeResource<ICrmAlignmentRule>(response.data);
  }

  async updateAlignmentRule(
    id: string,
    data: Partial<ICrmAlignmentRule>,
  ): Promise<ICrmAlignmentRule> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/alignment/rules/${id}`,
      data,
    );
    return deserializeResource<ICrmAlignmentRule>(response.data);
  }

  async getAlignmentSummary(): Promise<ICrmAlignmentSummary> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/alignment/summary');
    return deserializeResource<ICrmAlignmentSummary>(response.data);
  }

  async validateAlignment(): Promise<ICrmAlignmentValidation> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/alignment/validate',
    );
    return deserializeResource<ICrmAlignmentValidation>(response.data);
  }
}
