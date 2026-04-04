/**
 * Tweet Remix Node Types
 *
 * This node generates tweet variations using AI based on tone and length preferences.
 * Used for social media content creation workflows.
 */

export type TweetTone = 'professional' | 'casual' | 'witty' | 'viral';

export interface TweetVariation {
  id: string;
  text: string;
  charCount: number;
}

export interface TweetRemixNodeData {
  label: string;
  status: 'idle' | 'pending' | 'processing' | 'complete' | 'error';
  error?: string;

  // Input
  inputTweet: string | null;

  // Configuration
  tone: TweetTone;
  maxLength: number;

  // Output
  variations: TweetVariation[];
  selectedIndex: number | null;
  outputTweet: string | null;

  // Job state
  jobId: string | null;
}

export const defaultTweetRemixData: Partial<TweetRemixNodeData> = {
  inputTweet: null,
  jobId: null,
  label: 'Tweet Remix',
  maxLength: 280,
  outputTweet: null,
  selectedIndex: null,
  status: 'idle',
  tone: 'professional',
  variations: [],
};

export const tweetRemixNodeDefinition = {
  category: 'ai',
  defaultData: defaultTweetRemixData,
  description: 'Generate tweet variations with different tones and lengths',
  icon: 'Sparkles',
  inputs: [{ id: 'text', label: 'Input Tweet', required: true, type: 'text' }],
  label: 'Tweet Remix',
  outputs: [{ id: 'text', label: 'Selected Tweet', type: 'text' }],
  type: 'tweetRemix',
};
