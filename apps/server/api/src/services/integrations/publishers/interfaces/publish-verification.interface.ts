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
