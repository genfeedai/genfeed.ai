import type {
  IXArticleMetadata,
  IXArticleSection,
} from '@genfeedai/interfaces';
import type { Article } from '@genfeedai/models/content/article.model';
import type { GenerateArticlesRequest } from '@genfeedai/services/content/articles.service';

export interface XArticleTypeSelectorProps {
  onSelect: (type: 'quick' | 'x-article') => void;
}

export interface XArticleGenerateFormProps {
  onGenerate: (data: GenerateArticlesRequest) => void;
  isGenerating: boolean;
}

export interface XArticleSectionCardProps {
  section: IXArticleSection;
  onCopy: (sectionId: string) => void;
}

export interface XArticleAssetsBarProps {
  article: Article;
  metadata: IXArticleMetadata;
  onCopyFullArticle: () => void;
  onDownloadImage: (url: string, filename: string) => void;
  onGenerateHeaderImage: () => void;
  isGeneratingImage: boolean;
}
