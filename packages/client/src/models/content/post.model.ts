import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  CredentialPlatform,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import type {
  IBrand,
  ICredential,
  IIngredient,
  IOrganization,
  IPost,
  IPostAnalyticsSummary,
  ITag,
  IUser,
} from '@genfeedai/interfaces';

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
  public declare credential: ICredential;
  public declare tags?: ITag[];
  public declare label: string;
  public declare description?: string;
  public declare category: PostCategory;
  public declare status: PostStatus;
  public declare platform: CredentialPlatform;
  public declare externalId?: string;
  public declare externalShortcode?: string;
  public declare groupId?: string;
  public declare url?: string;
  public declare scheduledDate?: string | null;
  public declare uploadedAt: string;
  public declare publicationDate: string;
  public declare publishedAt?: string;
  public declare retryCount?: number;
  public declare parent?: string;
  public declare children?: IPost[];
  public declare order?: number;
  public declare isShareToFeedSelected?: boolean;

  constructor(data: Partial<IPost> = {}) {
    super(data);
  }
}
