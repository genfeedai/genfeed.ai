import type { Article } from '@genfeedai/models/content/article.model';
import type { ArticleFormState } from '@/props/content/article-editor.props';
import type {
  ArticleAccessCardProps,
  ArticlePublishDestination,
} from '@/props/edit/article-public-page.props';
import type { ArticleDeliveryCardProps } from '@/props/edit/long-form-delivery.props';

export type ArticleSidebarProps = {
  form: Pick<
    ArticleFormState,
    'status' | 'category' | 'content' | 'label' | 'summary'
  >;
  article: Article | null;
  destination: ArticlePublishDestination;
  isDirty?: boolean;
  isScoringSeo?: boolean;
  onScoreSeo?: () => void | Promise<void>;
  access?: Pick<ArticleAccessCardProps, 'isSaving' | 'onSave'>;
  delivery?: Pick<
    ArticleDeliveryCardProps,
    'isSavingExternalUrl' | 'onDelivered' | 'onSaveExternalUrl'
  >;
};
