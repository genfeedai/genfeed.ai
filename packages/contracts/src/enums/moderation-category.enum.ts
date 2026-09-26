/**
 * Genfeed moderation categories (#4880).
 *
 * Provider-neutral: every moderation adapter maps its own vendor labels onto
 * these, so thresholds, verdicts and the review UI never depend on a vendor.
 * Values are persisted inside moderation records — never rename one.
 */
export enum ModerationCategory {
  DRUGS = 'drugs',
  GRAPHIC = 'graphic',
  HARASSMENT = 'harassment',
  HATE = 'hate',
  SELF_HARM = 'self_harm',
  SEXUAL = 'sexual',
  SEXUAL_MINORS = 'sexual_minors',
  SPAM = 'spam',
  VIOLENCE = 'violence',
  WEAPONS = 'weapons',
}
