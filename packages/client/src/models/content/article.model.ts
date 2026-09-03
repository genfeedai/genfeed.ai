import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
} from '@genfeedai/contracts';
import type {
  IArticle,
  IBrand,
  IOrganization,
  ITag,
  IUser,
  IXArticleMetadata,
  SeoScorecardSnapshot,
} from '@genfeedai/contracts/interfaces';

export class Article extends BaseEntity implements IArticle {
  declare public user: IUser;
  declare public organization: IOrganization;
  declare public brand?: IBrand;
  declare public tags?: ITag[];
  declare public coverImageUrl?: string;
  declare public label: string;
  declare public slug: string;
  declare public summary: string;
  declare public content: string;
  declare public category: ArticleCategory;
  declare public status: ArticleStatus;
  declare public publishedAt?: string;
  declare public scope: AssetScope;
  declare public generationPrompt?: string;
  declare public seoScore?: number | null;
  declare public seoBreakdown?: SeoScorecardSnapshot | null;
  declare public xArticleMetadata?: IXArticleMetadata;

  constructor(data: Partial<IArticle> = {}) {
    super(data);
  }
}
