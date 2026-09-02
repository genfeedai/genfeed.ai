export interface IEnhancementMetadata {
  summary?: string;
  suggestions?: string[];
}

export type IEnhancedPostResponse = IEnhancementMetadata;

export type IEnhancedArticleResponse = IEnhancementMetadata;
