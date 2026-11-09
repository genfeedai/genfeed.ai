/** Brand look applied to every newsletter email (#9725). */
export interface NewsletterEmailBrand {
  label: string;
  primaryColor?: string | null;
  backgroundColor?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
}

/** Sender identity and footer from the brand's newsletter settings. */
export interface NewsletterEmailFooter {
  senderName?: string | null;
  postalAddress?: string | null;
  footerText?: string | null;
  isAttributionEnabled: boolean;
  /** "Sent with Genfeed" target, carrying the attribution source tag. */
  attributionUrl: string;
}

export interface NewsletterEmailContent {
  title: string;
  summary?: string | null;
  /** Sanitized HTML body. */
  bodyHtml: string;
  /** Plain-text body for the text/plain part. */
  bodyText: string;
  cta?: { label: string; url: string } | null;
  /** Public web version of the issue; omitted when there is none yet. */
  webUrl?: string | null;
  /**
   * The browser version of an issue: no unsubscribe or "view in browser"
   * links, since the reader is not a recipient.
   */
  isWebVersion?: boolean;
}

/**
 * Rendered email with per-recipient placeholders still in place:
 * `{{unsubscribeUrl}}` and `{{link:N}}` for each tracked link in `links`.
 */
export interface NewsletterEmailTemplate {
  html: string;
  text: string;
  links: string[];
}

export interface NewsletterRecipientLinks {
  unsubscribeUrl: string;
  linkUrl: (index: number) => string;
}
