import type { NewsletterSourceRef } from '@genfeedai/client/models';
import type { NewsletterStatus } from '@genfeedai/contracts/interfaces';

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
  public externalUrl?: string | null;
  public createdAt!: string;
  public updatedAt!: string;

  constructor(partial: Partial<Newsletter> = {}) {
    Object.assign(this, partial);
  }
}
