export interface PostingWindowPostInput {
  id: string;
  publishedAtMs: number;
  /** The one metric the ranking uses (engagement rate). Null means not measured. */
  metric: number | null;
  /** When `metric` was read. Null means no measurement row exists. */
  measuredAtMs: number | null;
  isDeleted: boolean;
  /** Null means the provider did not say. */
  isPromoted: boolean | null;
}

export interface PostingWindowOptions {
  /** Eligible posts needed overall before any window is ranked. */
  minimumPosts: number;
  /** Days between the first and last eligible post needed overall. */
  minimumSpanDays: number;
  /** Eligible posts a slot needs before it can be ranked. */
  minimumPostsPerSlot: number;
  /** Slot width in hours; must divide 24. */
  slotHours: number;
  /** A metric counts only when read this long after publishing, or later. */
  observationMinMs: number;
  /** ... and no later than this after publishing. */
  observationMaxMs: number;
  /** Windows returned. */
  topCount: number;
}

export interface PostingWindowInput {
  /** IANA timezone of the account; slots are local to it. */
  timezone: string;
  nowMs: number;
  posts: readonly Readonly<PostingWindowPostInput>[];
  options?: Partial<PostingWindowOptions>;
}

export type PostingWindowExclusionReason =
  | 'soft_deleted'
  | 'promoted'
  | 'invalid_publish_date'
  | 'not_yet_published'
  | 'no_metrics'
  | 'outside_observation_window'
  | 'invalid_metric';

export interface PostingWindow {
  /** 0 is Monday, 6 is Sunday, in the account timezone. */
  weekday: number;
  startHour: number;
  endHour: number;
  sampleCount: number;
  median: number;
}

export type PostingWindowStatus = 'ready' | 'insufficient_data';

export interface PostingWindowResult {
  /** `learned` only when enough data ranked at least one window. */
  basis: 'learned' | 'default';
  status: PostingWindowStatus;
  method: 'median-by-slot';
  timezone: string;
  options: PostingWindowOptions;
  eligibleCount: number;
  spanDays: number;
  excluded: Record<PostingWindowExclusionReason, number>;
  /** Best first; empty unless `status` is `ready`. */
  windows: PostingWindow[];
}

/** One recommended slot. Defaults have no weekday and no sample behind them. */
export interface PostingTimeWindow {
  /** 0 is Monday, 6 is Sunday; null for a default that applies every day. */
  weekday: number | null;
  startHour: number;
  endHour: number;
  sampleCount: number | null;
  median: number | null;
}

/** Answer of the posting-time recommendation, in the account timezone. */
export interface PostingTimeRecommendation {
  /** `learned` only from enough measured posts; `default` is a platform guess. */
  basis: 'learned' | 'default';
  method: 'median-by-slot' | 'platform-default';
  metric: 'engagementRate';
  platform: string;
  timezone: string;
  eligibleCount: number;
  spanDays: number;
  windows: PostingTimeWindow[];
  reasoning: string[];
}
