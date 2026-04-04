import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export type AgentGoalMetric = 'engagement_rate' | 'posts' | 'views';

export interface AgentGoal {
  brand?: string;
  currentValue: number;
  description?: string;
  endDate?: string;
  id: string;
  isActive: boolean;
  label: string;
  lastEvaluatedAt?: string;
  metric: AgentGoalMetric;
  progressPercent: number;
  startDate?: string;
  targetValue: number;
}

export interface CreateAgentGoalInput {
  brand?: string;
  description?: string;
  endDate?: string;
  isActive?: boolean;
  label: string;
  metric: AgentGoalMetric;
  startDate?: string;
  targetValue: number;
}

export class AgentGoalsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/agent/goals`, token);
  }

  public static getInstance(token: string): AgentGoalsService {
    return HTTPBaseService.getBaseServiceInstance(
      AgentGoalsService,
      token,
    ) as AgentGoalsService;
  }

  async list(): Promise<AgentGoal[]> {
    return await this.instance.get<AgentGoal[]>('').then((res) => res.data);
  }

  async create(data: CreateAgentGoalInput): Promise<AgentGoal> {
    return await this.instance
      .post<AgentGoal>('', data)
      .then((res) => res.data);
  }
}
