import type { Newsletter as PrismaNewsletter } from '@genfeedai/prisma';

export interface NewsletterSourceRef {
  id?: string;
  label?: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

export interface NewsletterDocument
  extends Omit<PrismaNewsletter, 'sourceRefs'> {
  _id: string;
  organization?: string;
  brand?: string | null;
  user?: string;
  sourceRefs?: NewsletterSourceRef[] | null;
  [key: string]: unknown;
}
