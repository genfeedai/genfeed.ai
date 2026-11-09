import type { NewsletterAccessLevel } from '@genfeedai/contracts/constants';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface NewsletterAccessSubscriber {
  id: string;
  organizationId: string;
}

export interface NewsletterAccessIssue {
  accessLevel: NewsletterAccessLevel;
  brandId: string;
}

/**
 * Whether a subscriber receives an issue in full or as a preview (#9718).
 * Every subscriber reads public and subscriber-only issues. Paid issues go
 * out as the preview until paid subscriptions exist (#9717); that check
 * replaces the `paid` branch here.
 */
@Traced()
@Injectable()
export class NewsletterRecipientAccessService {
  hasFullAccess(
    _subscriber: NewsletterAccessSubscriber,
    issue: NewsletterAccessIssue,
  ): Promise<boolean> {
    return Promise.resolve(issue.accessLevel !== 'paid');
  }
}
