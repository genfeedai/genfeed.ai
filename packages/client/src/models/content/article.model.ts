import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
} from '@genfeedai/enums';
import type {
  IArticle,
  IAsset,
  IBrand,
  IOrganization,
  ITag,
  IUser,
  IXArticleMetadata,
} from '@genfeedai/interfaces';

export class Article extends BaseEntity implements IArticle {
  public declare user: IUser;
  public declare organization: IOrganization;
  public declare brand?: IBrand;
  public declare tags?: ITag[];
  public declare banner?: IAsset;
  public declare label: string;
  public declare slug: string;
  public declare summary: string;
  public declare content: string;
  public declare category: ArticleCategory;
  public declare status: ArticleStatus;
  public declare publishedAt?: string;
  public declare scope: AssetScope;
  public declare generationPrompt?: string;
  public declare xArticleMetadata?: IXArticleMetadata;

  constructor(data: Partial<IArticle> = {}) {
    super(data);
  }
}
