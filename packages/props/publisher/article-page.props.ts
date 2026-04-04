import type { IAsset } from '@genfeedai/interfaces';
import type {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
} from '@genfeedai/enums';

export interface ArticlePageProps {
  params: Promise<{
    id: string;
  }>;
}

export interface ArticleFormPageProps {
  articleId?: string;
}

export interface ArticlePayload {
  label: string;
  slug: string;
  summary: string;
  content: string;
  category: ArticleCategory;
  status: ArticleStatus;
  banner?: IAsset;
  scope: AssetScope;
  publishedAt?: string;
}
