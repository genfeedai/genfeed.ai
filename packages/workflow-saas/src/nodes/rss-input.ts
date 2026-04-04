/**
 * RSS Input Node Types
 *
 * This node fetches and parses RSS feeds from URL or raw XML.
 * Used for content aggregation workflows.
 */

export interface RssFeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
}

export interface RssInputNodeData {
  label: string;
  status: 'idle' | 'pending' | 'processing' | 'complete' | 'error';
  error?: string;

  // Input mode
  inputMode: 'url' | 'text';
  feedUrl: string;
  rawXml: string;

  // Parsed data
  feedTitle: string | null;
  feedItems: RssFeedItem[] | null;
  selectedItemIndex: number;
}

export const defaultRssInputData: Partial<RssInputNodeData> = {
  feedItems: null,
  feedTitle: null,
  feedUrl: '',
  inputMode: 'url',
  label: 'RSS Input',
  rawXml: '',
  selectedItemIndex: 0,
  status: 'idle',
};

export const rssInputNodeDefinition = {
  category: 'input',
  defaultData: defaultRssInputData,
  description: 'Fetch and parse RSS feeds from URL or XML',
  icon: 'Rss',
  inputs: [],
  label: 'RSS Input',
  outputs: [
    { id: 'title', label: 'Item Title', type: 'text' },
    { id: 'description', label: 'Item Description', type: 'text' },
    { id: 'link', label: 'Item Link', type: 'text' },
  ],
  type: 'rssInput',
};
