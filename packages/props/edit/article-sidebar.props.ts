import type { Article } from '@genfeedai/models/content/article.model';
import type { ArticleFormState } from '@props/content/article-editor.props';
import type { ArticlePublishDestination } from '@props/edit/article-public-page.props';

export type ArticleSidebarProps = {
  form: Pick<ArticleFormState, 'status' | 'category' | 'label' | 'summary'>;
  article: Article | null;
  destination: ArticlePublishDestination;
  isDirty?: boolean;
  isScoringSeo?: boolean;
  onScoreSeo?: () => void | Promise<void>;
};
