export interface BuildTwitterThreadParams {
  /** Raw article content (may contain HTML — tags are stripped). */
  content: string;
  /** Resolved article label (already defaulted by the caller). */
  label: string;
  /** Article summary (empty string when absent). */
  summary: string;
  /** Fully-resolved public/preview article URL; omit to skip the link tweet. */
  articleUrl?: string;
}
