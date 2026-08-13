/**
 * Read-model shapes for the public newsletter RSS feed / canonical pages
 * (Substack import surface).
 */

/** Newsletter row projection consumed by the public feed builder. */
export interface NewsletterImportRecord {
  id: string;
  brandId?: string | null;
  content?: string | null;
  createdAt?: Date;
  isDeleted?: boolean;
  label: string;
  publishedAt?: Date | null;
  status: string;
  summary?: string | null;
  updatedAt?: Date;
}

/** Brand projection used to title and link the public newsletter feed. */
export interface NewsletterFeedBrand {
  id: string;
  label?: string | null;
  slug?: string | null;
}
