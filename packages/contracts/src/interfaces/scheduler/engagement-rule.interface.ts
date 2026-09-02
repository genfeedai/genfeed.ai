import type {
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
} from '../..';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export interface IEngagementRuleActionPayload {
  channels: Array<{ credentialId: string; platform: string }>;
  commentTemplate?: string;
}

export interface IEngagementMetricSnapshot {
  comments: number;
  engagementRate: number;
  likes: number;
  shares: number;
  views: number;
}

export interface CreateEngagementRuleInput {
  actionPayload?: IEngagementRuleActionPayload;
  actionType: EngagementRuleAction;
  brandId?: string;
  isEnabled?: boolean;
  metric: EngagementMetric;
  mode?: EngagementRuleMode;
  postGroupId: string;
  targetId: string;
  threshold: number;
  windowEndsAt?: string;
}

export interface UpdateEngagementRuleInput {
  actionPayload?: IEngagementRuleActionPayload;
  actionType?: EngagementRuleAction;
  brandId?: string | null;
  isEnabled?: boolean;
  metric?: EngagementMetric;
  mode?: EngagementRuleMode;
  threshold?: number;
  windowEndsAt?: string | null;
}

export interface IEngagementRule extends IBaseEntity {
  actionPayload: IEngagementRuleActionPayload;
  actionType: EngagementRuleAction;
  brand?: IBrand | string;
  brandId?: string | null;
  isEnabled: boolean;
  lastError?: string | null;
  metric: EngagementMetric;
  metricSnapshot?: IEngagementMetricSnapshot | null;
  mode: EngagementRuleMode;
  organization?: IOrganization | string;
  organizationId: string;
  postGroupId: string;
  resultingReleaseId?: string | null;
  state: EngagementRuleState;
  targetId: string;
  threshold: number;
  triggeredAt?: string | null;
  user?: IUser | string;
  userId: string;
  windowEndsAt?: string | null;
}

export interface IEngagementRuleDocument {
  actionPayload: IEngagementRuleActionPayload;
  actionType: EngagementRuleAction;
  brandId: string | null;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  isEnabled: boolean;
  lastError: string | null;
  metric: EngagementMetric;
  metricSnapshot: IEngagementMetricSnapshot | null;
  mode: EngagementRuleMode;
  organizationId: string;
  postGroupId: string;
  resultingReleaseId: string | null;
  state: EngagementRuleState;
  targetId: string;
  threshold: number;
  triggeredAt: Date | null;
  updatedAt: Date;
  userId: string;
  windowEndsAt: Date | null;
}
