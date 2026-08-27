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
  sourceRefs?: NewsletterSourceRef[] | null;
  [key: string]: unknown;
}
