export type McpCardKind =
  | 'post'
  | 'article'
  | 'image'
  | 'video'
  | 'audio'
  | 'media'
  | 'usage';

export interface McpCard {
  id: string;
  title: string;
  description: string;
  kind: McpCardKind;
  status: string;
  platform: string;
  date: string;
  url?: string;
  thumbnailUrl?: string;
}

export interface McpCardView {
  title: string;
  cards: McpCard[];
  total: number;
}

export interface McpAppResult {
  content: unknown[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}
