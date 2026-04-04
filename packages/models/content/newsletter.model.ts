import type {
  NewsletterSourceRef,
  NewsletterStatus,
} from '@genfeedai/client/models';

export class Newsletter {
  public id!: string;
  public label!: string;
  public topic!: string;
  public angle?: string;
  public summary?: string;
  public content!: string;
  public status!: NewsletterStatus;
  public sourceRefs?: NewsletterSourceRef[];
  public contextNewsletterIds?: string[];
  public generationPrompt?: string;
  public approvedAt?: string;
  public publishedAt?: string;
  public scheduledFor?: string;
  public createdAt!: string;
  public updatedAt!: string;

  constructor(partial: Partial<Newsletter> = {}) {
    Object.assign(this, partial);
  }
}
