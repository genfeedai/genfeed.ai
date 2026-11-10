import type { ArticleAccessLevel } from '../../constants/article-access.constant';

/** Why a reader may read a gated article in full (#9718). */
export type CreatorArticleAccessReason =
  | 'public'
  | 'subscriber'
  | 'team'
  | 'unlocked';

/**
 * What a signed-in reader may see of a published article: the full body when
 * they have access, otherwise the ways to get it.
 */
export interface ICreatorArticleAccess {
  accessLevel: ArticleAccessLevel;
  articleId: string;
  /** The full body; null while the reader has no access. */
  content: string | null;
  handle: string;
  hasAccess: boolean;
  label: string;
  reason: CreatorArticleAccessReason | null;
  /** The article's public address is `/@<handle>/articles/<slug>`. */
  slug: string | null;
  /** The creator's monthly subscription price; null when none is on offer. */
  subscriptionPriceCredits: number | null;
  /** The one-time unlock price; null when the article cannot be unlocked. */
  unlockPriceCredits: number | null;
}

export interface IUnlockCreatorArticleResult {
  access: ICreatorArticleAccess;
  /** Null when the reader had unlocked the article before. */
  transferId: string | null;
  /** False when nothing was charged. */
  wasApplied: boolean;
}
