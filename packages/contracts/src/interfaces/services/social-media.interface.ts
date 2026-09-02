export interface ITweetRequest {
  brand: string;
  tweets: string[];
}

export interface ILinkedInPostRequest {
  brand: string;
  content: string;
  media?: string[];
}

export interface IRedditPostRequest {
  brand: string;
  subreddit: string;
  title: string;
  content: string;
  type?: 'text' | 'link' | 'image';
}

export interface ISocialMediaResponse {
  success: boolean;
  postId?: string;
  threadId?: string;
  url?: string;
  error?: string;
}

export interface ITwitterEnhancementRequest {
  tweets: string[];
  goal?: string;
  checks?: string[];
}

export interface ITwitterEnhancementResponse {
  tweets: string[];
  summary?: string;
  suggestions?: string[];
}

export interface ILinkedInEnhancementRequest {
  content: string;
  goal?: string;
  checks?: string[];
}

export interface ILinkedInEnhancementResponse {
  content: string;
  summary?: string;
  suggestions?: string[];
}

export interface IRedditEnhancementRequest {
  title: string;
  content: string;
  subreddit: string;
  goal?: string;
  checks?: string[];
}

export interface IRedditEnhancementResponse {
  title: string;
  content: string;
  summary?: string;
  suggestions?: string[];
}
