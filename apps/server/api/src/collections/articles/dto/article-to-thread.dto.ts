export class ArticleToThreadDto {
  // No body params needed - uses article ID from URL
}

export interface TwitterThread {
  order: number;
  content: string;
  characterCount: number;
}

export interface TwitterThreadResponse {
  tweets: TwitterThread[];
  totalTweets: number;
}
