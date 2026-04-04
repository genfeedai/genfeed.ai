export interface ArticleCreationParams {
  topic: string;
  tone?: 'professional' | 'casual' | 'humorous' | 'technical' | 'storytelling';
  length?: 'short' | 'medium' | 'long';
  targetAudience?: string;
  keywords?: string[];
}

export interface ArticleResponse {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'processing';
  wordCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ArticleSearchParams {
  query: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface ArticleSearchResult {
  id: string;
  title: string;
  excerpt: string;
  category?: string;
  createdAt: string;
}
