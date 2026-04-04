import type {
  IAgentRun,
  IAnalytics,
  IBrand,
  IDarkroomCapabilities,
  IOrganizationSetting,
  IUser,
} from '@cloud/interfaces';
import type { AgentRunStats, IStreakSummary } from '@cloud/types';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface AccessBootstrapState {
  userId: string;
  organizationId: string;
  brandId: string;
  isSuperAdmin: boolean;
  isOnboardingCompleted: boolean;
  subscriptionStatus: string;
  subscriptionTier: string;
  hasEverHadCredits: boolean;
  creditsBalance: number;
}

export interface ProtectedAppBootstrapPayload {
  access: AccessBootstrapState;
  brands: IBrand[];
  currentUser: IUser | null;
  darkroomCapabilities: IDarkroomCapabilities | null;
  settings: IOrganizationSetting | null;
  streak: IStreakSummary | null;
}

export interface OverviewBootstrapPayload {
  activeRuns: IAgentRun[];
  analytics: Partial<IAnalytics>;
  reviewInbox: {
    approvedCount: number;
    changesRequestedCount: number;
    pendingCount: number;
    readyCount: number;
    recentItems: Array<{
      batchId: string;
      createdAt: string;
      format: string;
      id: string;
      mediaUrl?: string;
      platform?: string;
      postId?: string;
      reviewDecision?: 'approved' | 'rejected' | 'request_changes';
      status: string;
      summary: string;
    }>;
    rejectedCount: number;
  };
  runs: IAgentRun[];
  stats: AgentRunStats | null;
  timeSeries: unknown[];
}

export class AuthService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/auth`, token);
  }

  public static getInstance(token: string): AuthService {
    return HTTPBaseService.getBaseServiceInstance(
      AuthService,
      token,
    ) as AuthService;
  }

  public async getBootstrap(): Promise<ProtectedAppBootstrapPayload> {
    return await this.instance
      .get<ProtectedAppBootstrapPayload>('bootstrap')
      .then((res) => res.data);
  }

  public async getOverviewBootstrap(): Promise<OverviewBootstrapPayload> {
    return await this.instance
      .get<OverviewBootstrapPayload>('bootstrap/overview')
      .then((res) => res.data);
  }
}
