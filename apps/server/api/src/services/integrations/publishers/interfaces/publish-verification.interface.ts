/** Complete provider evidence, never a projection that silently drops errors. */
export interface ProviderVerificationItem {
  id: string;
  createdAt: Date;
  text: string;
  hasMedia: boolean;
  isReply: boolean;
  isQuote?: boolean;
  quoteId?: string;
  title?: string;
  status?: string;
  visibility?: string;
  url?: string;
  handle?: string;
  scheduledAt?: Date;
  /** What the provider reports the media to be; set by media-aware readers. */
  mediaKind?: VerificationMediaKind;
  /** Item count of a carousel as the provider lists it. */
  mediaCount?: number;
  shortcode?: string;
}

/**
 * `other` is anything the publisher cannot have produced (a link share, a
 * text post, an album). It is still evidence: the same caption on it is
 * ambiguous, not absent.
 */
export type VerificationMediaKind = 'image' | 'video' | 'carousel' | 'other';

/** The exact caption and media shape one publish attempt sent to the provider. */
export interface ProviderMediaVerificationMatch {
  text: string;
  /** Set when the provider has a title beside the caption (a video's title). */
  title?: string;
  mediaKind: Exclude<VerificationMediaKind, 'other'>;
  mediaCount: number;
}

export interface ProviderVerificationMatch {
  text: string;
  title?: string;
  status?: string;
  visibility?: string;
  isNativeHtml?: boolean;
  scheduledAt?: Date;
}

export interface ProviderVerificationPage {
  items: ProviderVerificationItem[];
  /** Opaque cursor only; provider-controlled next URLs are never requested. */
  nextCursor: string | null;
}

export type ProviderVerificationPageReader = (
  cursor?: string,
) => Promise<ProviderVerificationPage>;
