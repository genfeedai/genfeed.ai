import type { ArticleCategory, ArticleStatus } from '@genfeedai/enums';

export interface ArticleEditorProps {
  articleId: string;
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
