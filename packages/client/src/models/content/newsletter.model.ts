import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';

export type NewsletterStatus =
  | 'proposed'
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'published'
  | 'archived';

export type NewsletterSourceType = 'url' | 'manual' | 'kb' | 'newsletter';

export interface NewsletterSourceRef {
  label: string;
  note?: string;
  sourceType: NewsletterSourceType;
  url?: string;
}

export class Newsletter extends BaseEntity {
  declare public user?: unknown;
  declare public organization?: unknown;
  declare public brand?: unknown;
  declare public label: string;
  declare public topic: string;
  declare public angle?: string;
  declare public summary?: string;
  declare public content: string;
  declare public status: NewsletterStatus;
  declare public sourceRefs?: NewsletterSourceRef[];
  declare public contextNewsletterIds?: string[];
  declare public generationPrompt?: string;
  declare public approvedAt?: string;
  declare public publishedAt?: string;
  declare public scheduledFor?: string;

  constructor(data: Partial<Newsletter> = {}) {
    super(data);
  }
}
