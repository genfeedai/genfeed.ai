import type { Newsletter as PrismaNewsletter } from '@genfeedai/prisma';

export interface NewsletterSourceRef {
  id?: string;
  label?: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

export interface NewsletterDocument extends PrismaNewsletter {
  _id: string;
  organization?: string;
  brand?: string | null;
  user?: string;
  label?: string | null;
  topic?: string | null;
  summary?: string | null;
  approvedAt?: Date | string | null;
  approvedByUser?: string | null;
  publishedAt?: Date | string | null;
  publishedByUser?: string | null;
  contextNewsletterIds?: string[];
  sourceRefs?: NewsletterSourceRef[];
  [key: string]: unknown;
}
