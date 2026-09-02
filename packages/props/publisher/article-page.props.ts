import type {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
} from '@genfeedai/contracts';
import type { IAsset } from '@genfeedai/contracts/interfaces';

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
