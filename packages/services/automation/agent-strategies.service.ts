import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import { BaseService } from '@services/core/base.service';

const agentStrategySerializer: IServiceSerializer<AgentStrategy> = {
  serialize: (data) => data,
};

export interface AgentStrategyBudgetCap {
  creditBudget: number;
  key: string;
}

export interface AgentStrategyOpportunitySources {
  evergreenCadenceEnabled: boolean;
  eventTriggersEnabled: boolean;
  trendWatchersEnabled: boolean;
}

export interface AgentStrategyBudgetPolicy {
  maxRetriesPerOpportunity: number;
  monthlyCreditBudget: number;
  perFormatCaps: AgentStrategyBudgetCap[];
  perPlatformCaps: AgentStrategyBudgetCap[];
  reserveTrendBudget: number;
}

export interface AgentStrategyPublishPolicy {
  autoPublishEnabled: boolean;
  brandSafetyMode: 'standard' | 'strict';
  minImageScore: number;
  minPostScore: number;
  videoAutopublishEnabled: boolean;
}

export interface AgentStrategyReportingPolicy {
  dailyDigestEnabled: boolean;
  reportRecipientUserIds: string[];
  weeklySummaryEnabled: boolean;
}

export interface AgentStrategyRankingPolicy {
  costEfficiencyWeight: number;
  expectedTrafficWeight: number;
  freshnessWeight: number;
  historicalConfidenceWeight: number;
  relevanceWeight: number;
}

export interface RunAgentStrategyWorkflowInput {
  cta?: string;
  inputs?: Record<string, unknown>;
  prompt?: string;
  referenceImage?: string;
  topic?: string;
  workflowId?: string;
}

export interface AgentStrategyWorkflowInputPreview {
  defaultValue: unknown;
  description: string | null;
  filledValue: unknown;
  key: string;
  label: string;
  required: boolean;
  source: 'default' | 'override' | 'strategy' | 'unfilled';
  type: string;
}

export interface AgentStrategyWorkflowBinding {
  inputs: AgentStrategyWorkflowInputPreview[];
  missingRequiredKeys: string[];
  preferredWorkflowId: string | null;
  preferredWorkflowTemplateId: string | null;
  templateDescription: string | null;
  workflowId: string | null;
  workflowLabel: string | null;
}

export interface AgentStrategyWorkflowRunResult {
  executionId: string;
  filledInputs: Record<string, unknown>;
  missingRequiredKeys: string[];
  status: string;
  workflowId: string;
  workflowLabel: string | null;
}

export interface CreateAgentStrategyInput {
  agentType?: string;
  autonomyMode?: string;
  autoPublishConfidenceThreshold?: number;
  brandId?: string;
  budgetPolicy?: Partial<AgentStrategyBudgetPolicy>;
  dailyCreditBudget?: number;
  displayRole?: string;
  goalProfile?: 'reach_traffic';
  goalId?: string;
  isActive?: boolean;
  isEnabled?: boolean;
  label: string;
  minCreditThreshold?: number;
  model?: string;
  opportunitySources?: Partial<AgentStrategyOpportunitySources>;
  platforms?: string[];
  skillSlugs?: string[];
  preferredWorkflowId?: string;
  preferredWorkflowTemplateId?: string;
  workflowInputOverrides?: Array<{
    key: string;
    value: string | number | boolean;
  }>;
  postsPerWeek?: number;
  publishPolicy?: Partial<AgentStrategyPublishPolicy>;
  qualityTier?: 'budget' | 'balanced' | 'high_quality';
  rankingPolicy?: Partial<AgentStrategyRankingPolicy>;
  reportingPolicy?: Partial<AgentStrategyReportingPolicy>;
  reportsToLabel?: string;
  runFrequency?: string;
  teamGroup?: string;
  topics?: string[];
  voice?: string;
  weeklyCreditBudget?: number;
}

export interface AgentStrategyOpportunity {
  decisionReason?: string;
  estimatedCreditCost: number;
  expectedTrafficScore: number;
  expiresAt?: string;
  formatCandidates: string[];
  id: string;
  platformCandidates: string[];
  priorityScore: number;
  relevanceScore: number;
  sourceRef?: string;
  sourceType: 'event' | 'evergreen' | 'trend';
  status:
    | 'approved'
    | 'discarded'
    | 'expired'
    | 'generating'
    | 'held'
    | 'published'
    | 'queued'
    | 'revising';
  topic: string;
}

export interface AgentStrategyPerformanceSnapshot {
  bestPlatformFormatPairs: Array<{
    format: string;
    platform: string;
    score: number;
  }>;
  bestPostingWindows: string[];
  clicks: number;
  costPerVisit: number;
  creditsSpent: number;
  ctr: number;
  generatedCount: number;
  impressions: number;
  publishedCount: number;
  topHooks: string[];
  topTopics: string[];
  visits: number;
}

export interface AgentStrategyReport {
  allocationChanges: string[];
  bestPlatformFormatPairs: AgentStrategyPerformanceSnapshot['bestPlatformFormatPairs'];
  bestPostingWindows: string[];
  clicks: number;
  costPerVisit: number;
  creditsSpent: number;
  ctr: number;
  generatedCount: number;
  id: string;
  impressions: number;
  periodEnd: string;
  periodStart: string;
  publishedCount: number;
  reportType: 'daily' | 'weekly';
  topHooks: string[];
  topTopics: string[];
  visits: number;
}

export class AgentStrategy {
  id!: string;
  organizationId!: string;
  brand?: Pick<IBrand, 'id' | 'label' | 'slug'>;
  brandId?: string;
  userId!: string;
  agentType!: string;
  autonomyMode!: string;
  isActive!: boolean;
  isEnabled!: boolean;
  label!: string;
  displayRole?: string;
  teamGroup?: string;
  reportsToLabel?: string;
  goalProfile!: 'reach_traffic';
  goalId?: string;
  topics!: string[];
  voice?: string;
  model?: string;
  platforms!: string[];
  skillSlugs!: string[];
  preferredWorkflowId?: string;
  preferredWorkflowTemplateId?: string;
  workflowInputOverrides?: Array<{
    key: string;
    value: string | number | boolean;
  }>;
  postsPerWeek!: number;
  runFrequency!: string;
  timezone!: string;
  dailyCreditBudget!: number;
  minCreditThreshold!: number;
  weeklyCreditBudget!: number;
  budgetPolicy!: AgentStrategyBudgetPolicy;
  opportunitySources!: AgentStrategyOpportunitySources;
  publishPolicy!: AgentStrategyPublishPolicy;
  reportingPolicy!: AgentStrategyReportingPolicy;
  rankingPolicy!: AgentStrategyRankingPolicy;
  creditsUsedToday!: number;
  dailyCreditsUsed!: number;
  creditsUsedThisWeek!: number;
  monthToDateCreditsUsed!: number;
  expectedSpendToDate!: number;
  reserveTrendBudgetRemaining!: number;
  autoPublishConfidenceThreshold!: number;
  requiresManualReactivation!: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  dailyCreditResetAt?: string;
  monthlyResetAt?: string;
  consecutiveFailures!: number;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<AgentStrategy>) {
    Object.assign(this, partial);
  }
}

export class AgentStrategiesService extends BaseService<
  AgentStrategy,
  CreateAgentStrategyInput,
  Partial<CreateAgentStrategyInput>
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.AGENT_STRATEGIES,
      token,
      AgentStrategy,
      agentStrategySerializer,
    );
  }

  public static getInstance(token: string): AgentStrategiesService {
    return BaseService.getDataServiceInstance(AgentStrategiesService, token);
  }

  async list(params?: {
    agentType?: string;
    brandId?: string;
    isActive?: boolean;
  }): Promise<AgentStrategy[]> {
    return this.findAll(params as Record<string, unknown>);
  }

  async getById(id: string): Promise<AgentStrategy> {
    return this.findOne(id);
  }

  async create(data: CreateAgentStrategyInput): Promise<AgentStrategy> {
    return this.post(data);
  }

  async update(
    id: string,
    data: Partial<CreateAgentStrategyInput>,
  ): Promise<AgentStrategy> {
    return this.patch(id, data);
  }

  async setActive(id: string, isActive: boolean): Promise<AgentStrategy> {
    return this.update(id, { isActive });
  }

  async runNow(id: string): Promise<{ message: string }> {
    const response = await this.instance.post<{ message: string }>(
      `/${id}/run-now`,
    );
    return response.data;
  }

  async getWorkflowBinding(id: string): Promise<AgentStrategyWorkflowBinding> {
    const response = await this.instance.get<AgentStrategyWorkflowBinding>(
      `/${id}/workflow-binding`,
    );
    return response.data;
  }

  async runWorkflow(
    id: string,
    body: RunAgentStrategyWorkflowInput = {},
  ): Promise<AgentStrategyWorkflowRunResult> {
    const response = await this.instance.post<AgentStrategyWorkflowRunResult>(
      `/${id}/run-workflow`,
      body,
    );
    return response.data;
  }

  async planNow(id: string): Promise<{ message: string }> {
    const response = await this.instance.post<{ message: string }>(
      `/${id}/plan-now`,
    );
    return response.data;
  }

  async listOpportunities(id: string): Promise<AgentStrategyOpportunity[]> {
    const response = await this.instance.get<AgentStrategyOpportunity[]>(
      `/${id}/opportunities`,
    );
    return response.data;
  }

  async listReports(id: string): Promise<AgentStrategyReport[]> {
    const response = await this.instance.get<AgentStrategyReport[]>(
      `/${id}/reports`,
    );
    return response.data;
  }

  async getPerformanceSnapshot(
    id: string,
  ): Promise<AgentStrategyPerformanceSnapshot> {
    const response = await this.instance.get<AgentStrategyPerformanceSnapshot>(
      `/${id}/performance-snapshot`,
    );
    return response.data;
  }

  async reportNow(id: string): Promise<AgentStrategyReport> {
    const response = await this.instance.post<AgentStrategyReport>(
      `/${id}/report-now`,
    );
    return response.data;
  }
}
