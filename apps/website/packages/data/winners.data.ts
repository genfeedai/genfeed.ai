export interface Winner {
  /** Alt text for `previewSrc`. Required whenever a preview asset is set. */
  previewAlt?: string;
  /** Preview still. Omitted until the asset is on the CDN — the card then runs type-only. */
  previewSrc?: string;
  /** Public permalink to the published piece. */
  canonicalUrl: string;
  id: string;
  /** Names the destination, e.g. "View on LinkedIn". Never a bare "View". */
  linkLabel: string;
  /** What the metric measures and when it was read. */
  metricLabel: string;
  /** The verified number on its own, e.g. "30,000". */
  metricValue: string;
  /** What Genfeed produced, e.g. "Post copy + generated frame". */
  mediaType: string;
  /** Publication platform as published, e.g. "LinkedIn". */
  platform: string;
  /** ISO date the piece went live. */
  publishedAt: string;
  /**
   * Names exactly what Genfeed generated. Claims generation only unless the
   * piece was also scheduled and published through Genfeed.
   */
  provenance: string;
  title: string;
}

/**
 * Published work generated in Genfeed, each with a metric we can evidence and a
 * live permalink anyone can open. Only pieces whose provenance and numbers are
 * verified belong here: every surface that reads this renders nothing rather
 * than a placeholder.
 */
export const winners: Winner[] = [
  {
    canonicalUrl:
      'https://www.linkedin.com/posts/vincentshipsit_if-youre-not-on-x-youve-probably-missed-share-7496948106077323264-pETL/',
    id: 'linkedin-2026-08-23',
    linkLabel: 'View on LinkedIn',
    mediaType: 'Post copy + generated frame',
    metricLabel: 'Impressions, read 29 Aug 2026',
    metricValue: '30,000',
    platform: 'LinkedIn',
    provenance: 'Copy and frame generated in Genfeed.',
    publishedAt: '2026-08-23',
    title: 'An organic LinkedIn post, written and framed in one pass',
  },
];

export function getPublishedWinners(limit = 3): Winner[] {
  return winners.slice(0, limit);
}
