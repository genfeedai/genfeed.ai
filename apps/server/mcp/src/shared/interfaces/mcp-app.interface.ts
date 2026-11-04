export type McpCardKind =
  | 'post'
  | 'article'
  | 'image'
  | 'video'
  | 'audio'
  | 'media'
  | 'summary';

export type McpMediaKind = 'audio' | 'image' | 'video';

/** How the content-card view arranges its cards. */
export type McpCardLayout =
  | 'calendar'
  | 'cards'
  | 'media'
  | 'organizations'
  | 'posts';

export interface McpCardAuthor {
  name?: string;
  handle?: string;
  avatarUrl?: string;
}

export interface McpCardMedia {
  id: string;
  kind: McpMediaKind;
  url?: string;
  thumbnailUrl?: string;
}

/** One entry of a list fact: a brand with its logo, a channel with its state. */
export interface McpCardFactItem {
  avatarUrl?: string;
  label: string;
  /** A social platform; the entry then shows the platform badge. */
  platform?: string;
  /** A product status ('scheduled', 'needs_review'), shown as an iconed badge. */
  status?: string;
}

/** One labelled value on a summary card (organization, role, setup state…). */
export interface McpCardFact {
  label: string;
  value: string;
  /** Replaces the plain value with a row of chips. */
  items?: McpCardFactItem[];
  /** Shows the value as an iconed status badge ('completed', 'needs_attention'). */
  status?: string;
}

/** A headline figure on a summary card: credits left, credits used. */
export interface McpCardMetric {
  label: string;
  value: string;
  /** The first metric of a card is shown large. */
  isPrimary?: boolean;
  /** A change over a period, shown as an arrow badge. */
  trend?: { direction: 'down' | 'flat' | 'up'; label: string };
}

/** A button on a card; the view runs it through the host. */
export interface McpCardAction {
  kind: 'select_brand';
  /** The brand the action selects. */
  brandId: string;
  label: string;
}

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
  /** Brand logo or account avatar shown at the head of a summary card. */
  avatarUrl?: string;
  actions?: McpCardAction[];
  /** Shows the avatar frame (initials when there is no picture) without an action. */
  hasAvatar?: boolean;
  /** Labelled values of a summary card, in display order. */
  facts?: McpCardFact[];
  /** Headline figures of a summary card, above its facts. */
  metrics?: McpCardMetric[];
  /** Media kinds attached to a post (image, video, audio), in order. */
  attachments?: McpMediaKind[];
  author?: McpCardAuthor;
  media?: McpCardMedia[];
  /** First attached media with a URL, for a post preview player. */
  mediaKind?: McpMediaKind;
  mediaUrl?: string;
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

/** One organization the signed-in user can work in. */
export interface McpOrganizationChoice {
  id: string;
  isActive: boolean;
  label: string;
}

/** The organization dropdown of the workspace card. */
export interface McpOrganizationSwitcher {
  /** The organization this connection works inside; empty when unknown. */
  activeId: string;
  /** The user approved organization switching for this connection. */
  canSwitch: boolean;
  choices: McpOrganizationChoice[];
}

export interface McpCardView {
  title: string;
  /** The view lists unlike cards (account, release), so a card count says nothing. */
  isCountHidden?: boolean;
  cards: McpCard[];
  total: number;
  layout: McpCardLayout;
  calendar?: McpCalendarView;
  /** Set on the workspace card; `cards` then list the active organization's brands. */
  organizations?: McpOrganizationSwitcher;
}

export interface McpAppResult {
  content: unknown[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}
