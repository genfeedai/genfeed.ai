import type { Article } from '@genfeedai/models/content/article.model';
import type { ArticleFormState } from '@props/content/article-editor.props';

export type ArticleSidebarProps = {
  form: Pick<ArticleFormState, 'status' | 'category'>;
  article: Article | null;
  isDirty?: boolean;
  isScoringSeo?: boolean;
  onScoreSeo?: () => void | Promise<void>;
};
