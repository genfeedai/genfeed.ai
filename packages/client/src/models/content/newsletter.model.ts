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
  public declare user?: unknown;
  public declare organization?: unknown;
  public declare brand?: unknown;
  public declare label: string;
  public declare topic: string;
  public declare angle?: string;
  public declare summary?: string;
  public declare content: string;
  public declare status: NewsletterStatus;
  public declare sourceRefs?: NewsletterSourceRef[];
  public declare contextNewsletterIds?: string[];
  public declare generationPrompt?: string;
  public declare approvedAt?: string;
  public declare publishedAt?: string;
  public declare scheduledFor?: string;

  constructor(data: Partial<Newsletter> = {}) {
    super(data);
  }
}
