export interface ITwitterSearchResult {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  engagement: number;
}

export interface ITwitterOpportunity {
  type: 'reply' | 'quote' | 'original';
  suggestedText: string;
  reason: string;
  verified: boolean;
  targetTweetId?: string;
  targetAuthor?: string;
  targetTweet?: string;
  engagement?: { likes: number; retweets: number };
}

export interface ITwitterVoiceConfig {
  description: string;
  handle: string;
  searchQuery: string;
}

export interface ITwitterPublishRequest {
  type: 'reply' | 'quote' | 'original';
  text: string;
  targetTweetId?: string;
}

export interface ITwitterPublishResult {
  tweetId?: string;
  tweetUrl?: string;
  success: boolean;
  error?: string;
}
