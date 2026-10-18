/**
 * Brand OS Policy (#7339): what a brand's agents may publish without a human.
 *
 * The Policy is a section of a Brand OS revision. It takes effect only when an
 * owner or admin approves that revision; the approved revision's Policy is the
 * brand's active Policy. A brand with no approved Policy is judged by the
 * default one (`createDefaultBrandPublishPolicy`).
 */

/** `earned`: auto-publish once the approval streak allows it. `review`: always review. */
export type BrandPublishAutonomy = 'earned' | 'review';

/** Formats the Policy can open to earned autonomy. Video is always reviewed. */
export type BrandPublishPolicyFormat = 'text' | 'image';

/** A draft's format at the gate. */
export type BrandPublishDraftFormat = BrandPublishPolicyFormat | 'video';

export type BrandPublishRequiredCheck =
  | 'moderation'
  | 'brand_validation'
  | 'fact_check';

export interface IBrandPublishQuietHours {
  /** Local `HH:mm` (24h) in the Policy timezone. */
  start: string;
  /** Local `HH:mm` (24h). An end before the start spans midnight. */
  end: string;
}

export interface IBrandPublishPolicy {
  version: 1;
  /** IANA timezone for quiet hours and the daily and weekly caps. */
  timezone: string;
  autonomy: {
    /** Platform → autonomy. A platform not listed follows the earned streak. */
    platforms: Record<string, BrandPublishAutonomy>;
    formats: Record<BrandPublishPolicyFormat, BrandPublishAutonomy>;
  };
  maxPostsPerDay: number | null;
  maxPostsPerWeek: number | null;
  quietHours: IBrandPublishQuietHours | null;
  bannedTopics: string[];
  bannedPhrases: string[];
  bannedClaims: string[];
  /** 0–100. A draft with no recorded score is held while this is set. */
  minQualityScore: number | null;
  requiredChecks: BrandPublishRequiredCheck[];
}

export type BrandPolicyRule =
  | 'platform_requires_review'
  | 'format_requires_review'
  | 'video_always_reviewed'
  | 'banned_phrase'
  | 'banned_topic'
  | 'banned_claim'
  | 'guardrail'
  | 'daily_cap'
  | 'weekly_cap'
  | 'quiet_hours'
  | 'min_quality_score'
  | 'required_check'
  | 'policy_judge_unavailable';

/** One broken rule, recorded on the held draft so its reviewer sees it. */
export interface IBrandPolicyViolation {
  rule: BrandPolicyRule;
  detail: string;
}
