export interface Bookmark {
  id: string;
  category: string;
  url: string;
  platform: string;
  content: string;
  author?: string;
  authorHandle?: string;
  thumbnailUrl?: string;
  intent: string;
  generatedIngredients: string[];
  savedAt: string;
  platformData?: {
    tweetId?: string;
    engagement?: {
      likes?: number;
      retweets?: number;
      replies?: number;
    };
  };
}
