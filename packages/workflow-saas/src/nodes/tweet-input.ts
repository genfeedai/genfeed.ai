/**
 * Tweet Input Node Types
 *
 * This node fetches tweets from Twitter/X via URL or allows manual text input.
 * Requires Twitter API access for URL fetching.
 */

export interface TweetInputNodeData {
  label: string;
  status: 'idle' | 'pending' | 'processing' | 'complete' | 'error';
  error?: string;

  // Input mode
  inputMode: 'url' | 'text';
  tweetUrl: string;
  rawText: string;

  // Extracted data
  extractedTweet: string | null;
  authorHandle: string | null;
}

export const defaultTweetInputData: Partial<TweetInputNodeData> = {
  authorHandle: null,
  extractedTweet: null,
  inputMode: 'url',
  label: 'Tweet Input',
  rawText: '',
  status: 'idle',
  tweetUrl: '',
};

export const tweetInputNodeDefinition = {
  category: 'input',
  defaultData: defaultTweetInputData,
  description: 'Fetch tweet content from URL or paste text directly',
  icon: 'Twitter',
  inputs: [],
  label: 'Tweet Input',
  outputs: [{ id: 'text', label: 'Tweet Text', type: 'text' }],
  type: 'tweetInput',
};
