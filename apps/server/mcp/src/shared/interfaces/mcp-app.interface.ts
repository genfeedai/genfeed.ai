export type McpCardKind =
  | 'post'
  | 'article'
  | 'image'
  | 'video'
  | 'audio'
  | 'media'
  | 'usage';

/** How the content-card view arranges its cards. */
export type McpCardLayout = 'calendar' | 'cards' | 'media' | 'posts';

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
  /** A media job that has not produced its output yet; the view polls it. */
  isPending?: boolean;
  /** 0–100 when the generation reports progress. */
  progress?: number;
  stage?: string;
}

export interface McpCalendarDay {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** A day with nothing scheduled. */
  isGap: boolean;
  posts: McpCard[];
}

export interface McpCalendarView {
  days: McpCalendarDay[];
  draftsCount: number;
}

export interface McpCardView {
  title: string;
  cards: McpCard[];
  total: number;
  layout: McpCardLayout;
  calendar?: McpCalendarView;
}

export interface McpAppResult {
  content: unknown[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}
