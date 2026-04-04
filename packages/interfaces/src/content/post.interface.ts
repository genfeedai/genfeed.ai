import { CredentialPlatform, PostCategory } from '@genfeedai/enums';
import type { IPostAnalyticsSummary } from '../analytics/analytics.interface';
import type {
  IBaseEntity,
  IBrand,
  ICredential,
  IEvaluation,
  IIngredient,
  IOrganization,
  ITag,
  IUser,
} from '../index';

export interface IPost extends IBaseEntity {
  ingredients: IIngredient[];
  category: PostCategory;
  credential: ICredential;
  user: IUser;
  organization: IOrganization;
  brand: IBrand;
  platform: CredentialPlatform;
  externalId?: string;
  externalShortcode?: string;
  groupId?: string;
  url?: string;
  label?: string;
  description?: string;
  tags?: ITag[];
  status: string;
  scheduledDate?: string | null;
  uploadedAt: string;
  publicationDate: string;
  publishedAt?: string;
  retryCount?: number;
  analytics?: IPostAnalyticsSummary;
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  totalSaves?: number;
  avgEngagementRate?: number;
  evalScore?: number | null;
  evaluation?: IEvaluation | null;
  parent?: string;
  children?: IPost[];
  order?: number;
  isShareToFeedSelected?: boolean;
  platformUrl?: string | null;
}

export interface IPostPlatformConfig {
  credentialId: string;
  platform: string;
  handle: string;
  label: string;
  description: string;
  overrideSchedule: boolean;
  customScheduledDate: string;
  status: string;
  enabled: boolean;
  isCredentialValid?: boolean;
  category?: PostCategory;
  isShareToFeedSelected?: boolean;
}
