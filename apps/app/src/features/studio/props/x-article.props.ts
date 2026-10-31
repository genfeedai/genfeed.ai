import type {
  IXArticleMetadata,
  IXArticleSection,
} from '@genfeedai/contracts/interfaces';
import type { Article } from '@genfeedai/models/content/article.model';

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
  onGenerateTeaserPost?: () => void;
  onGenerateTeaserThread?: () => void;
  isGeneratingImage: boolean;
  isGeneratingTeaser?: boolean;
}
