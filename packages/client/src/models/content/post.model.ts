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
  public declare analytics?: IPostAnalyticsSummary;
  public declare totalViews?: number;
  public declare totalLikes?: number;
  public declare totalComments?: number;
  public declare totalShares?: number;
  public declare totalSaves?: number;
  public declare avgEngagementRate?: number;
  public declare user: IUser;
  public declare organization: IOrganization;
  public declare brand: IBrand;
  public declare ingredients: IIngredient[];
  public declare credential?: ICredential;
  public declare tags?: ITag[];
  public declare label: string;
  public declare description?: string;
  public declare category: PostCategory;
  public declare format?: PostFormat;
  public declare status: PostStatus;
  public declare targetExecutionState: TargetExecutionState;
  public declare visibility: PostVisibility;
  public declare platform?: CredentialPlatform;
  public declare externalId?: string;
  public declare externalShortcode?: string;
  public declare groupId?: string;
  public declare generationId?: string | null;
  public declare url?: string;
  public declare scheduledDate?: string | null;
  public declare uploadedAt: string;
  public declare publicationDate: string;
  public declare publishedAt?: string;
  public declare retryCount?: number;
  public declare targetError?: IChannelTargetError | null;
  public declare originalPostId?: string | null;
  public declare reviewBatchId?: string | null;
  public declare reviewItemId?: string | null;
  public declare parent?: string;
  public declare children?: IPost[];
  public declare order?: number;
  public declare variantId?: string | null;
  public declare source?: string | null;
  public declare sourceActionId?: string | null;
  public declare sourceWorkflowId?: string | null;
  public declare sourceWorkflowName?: string | null;
  public declare isShareToFeedSelected?: boolean;
  public declare seoScore?: number | null;
  public declare seoBreakdown?: SeoScorecardSnapshot | null;

  constructor(data: Partial<IPost> = {}) {
    super(data);
  }
}
