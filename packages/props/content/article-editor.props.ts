import type { ArticleCategory, ArticleStatus } from '@genfeedai/contracts';

export interface ArticleEditorProps {
  articleId?: string;
  credentialId?: string;
}

export interface ArticleFormState {
  label: string;
  slug: string;
  summary: string;
  content: string;
  category: ArticleCategory;
  status: ArticleStatus;
  tags: string;
}
