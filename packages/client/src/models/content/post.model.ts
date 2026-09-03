import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  CredentialPlatform,
  PostCategory,
  PostFormat,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IBrand,
  IChannelTargetError,
  ICredential,
  IIngredient,
  IOrganization,
  IPost,
  IPostAnalyticsSummary,
  ITag,
  IUser,
  SeoScorecardSnapshot,
} from '@genfeedai/contracts/interfaces';

export class Post extends BaseEntity implements IPost {
  declare public analytics?: IPostAnalyticsSummary;
  declare public totalViews?: number;
  declare public totalLikes?: number;
  declare public totalComments?: number;
  declare public totalShares?: number;
  declare public totalSaves?: number;
  declare public avgEngagementRate?: number;
  declare public user: IUser;
  declare public organization: IOrganization;
  declare public brand: IBrand;
  declare public ingredients: IIngredient[];
  declare public credential?: ICredential;
  declare public tags?: ITag[];
  declare public label: string;
  declare public description?: string;
  declare public category: PostCategory;
  declare public format?: PostFormat;
  declare public status: PostStatus;
  declare public targetExecutionState: TargetExecutionState;
  declare public visibility: PostVisibility;
  declare public platform?: CredentialPlatform;
  declare public externalId?: string;
  declare public externalShortcode?: string;
  declare public groupId?: string;
  declare public generationId?: string | null;
  declare public url?: string;
  declare public scheduledDate?: string | null;
  declare public uploadedAt: string;
  declare public publicationDate: string;
  declare public publishedAt?: string;
  declare public retryCount?: number;
  declare public targetError?: IChannelTargetError | null;
  declare public originalPostId?: string | null;
  declare public reviewBatchId?: string | null;
  declare public reviewItemId?: string | null;
  declare public parent?: string;
  declare public children?: IPost[];
  declare public order?: number;
  declare public variantId?: string | null;
  declare public source?: string | null;
  declare public sourceActionId?: string | null;
  declare public sourceWorkflowId?: string | null;
  declare public sourceWorkflowName?: string | null;
  declare public isShareToFeedSelected?: boolean;
  declare public seoScore?: number | null;
  declare public seoBreakdown?: SeoScorecardSnapshot | null;

  constructor(data: Partial<IPost> = {}) {
    super(data);
  }
}
