import type { WorkflowNodeStatus } from '@genfeedai/enums';

export interface RssFeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
}

export interface RssInputNodeData {
  label: string;
  status: WorkflowNodeStatus;
  inputMode: 'url' | 'text';
  feedUrl: string;
  rawXml: string;
  feedTitle: string | null;
  feedItems: RssFeedItem[] | null;
  selectedItemIndex: number;
  error?: string;
}

export interface RssInputNodeProps {
  id: string;
  data: RssInputNodeData;
  onUpdate: (id: string, data: Partial<RssInputNodeData>) => void;
}

export interface TweetInputNodeData {
  label: string;
  status: WorkflowNodeStatus;
  inputMode: 'url' | 'text';
  tweetUrl: string;
  rawText: string;
  extractedTweet: string | null;
  authorHandle: string | null;
  error?: string;
}

export interface TweetInputNodeProps {
  id: string;
  data: TweetInputNodeData;
  onUpdate: (id: string, data: Partial<TweetInputNodeData>) => void;
}
