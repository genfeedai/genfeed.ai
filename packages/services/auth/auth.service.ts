import type { MemberRole, ReviewDecision } from '@genfeedai/contracts';
import type {
  IAnalytics,
  IBrand,
  IFleetCapabilities,
  IOrganizationSetting,
  IUser,
} from '@genfeedai/contracts/interfaces';
import type { IStreakSummary } from '@genfeedai/contracts/types';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface AccessBootstrapState {
  userId: string;
  organizationId: string;
  memberRole: MemberRole | null;
  brandId: string;
  isSuperAdmin: boolean;
  isOnboardingCompleted: boolean;
  subscriptionStatus: string;
  subscriptionTier: string;
  hasEverHadCredits: boolean;
  creditsBalance: number;
  /**
   * The balance pays for one standard image on the organization's default
   * image model (see AccessBootstrapStatePayload on the API). Absent means
   * unknown, which never reads as "cannot afford".
   */
  canAffordDefaultGeneration?: boolean;
  // First-asset unlock gate flags (see AccessBootstrapStatePayload on the API).
  hasGeneratedFirstAsset: boolean;
  hasDismissedAssetGate: boolean;
}

export interface ProtectedAppBootstrapPayload {
  access: AccessBootstrapState;
  brands: IBrand[];
  currentUser: IUser | null;
  fleetCapabilities: IFleetCapabilities | null;
  settings: IOrganizationSetting | null;
  streak: IStreakSummary | null;
}

export interface OverviewBootstrapPayload {
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
      reviewDecision: ReviewDecision;
      status: string;
      summary: string;
    }>;
    rejectedCount: number;
  };
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
