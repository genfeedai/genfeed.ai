export interface IXArticleSection {
  id: string;
  heading: string;
  content: string;
  order: number;
  pullQuote?: string;
}

export interface IXArticleMetadata {
  sections: IXArticleSection[];
  headerImagePrompt?: string;
  headerImageUrl?: string;
  estimatedReadTime: number;
  wordCount: number;
}
