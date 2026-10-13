import type { NewsletterDeliveryMode } from '../../constants/long-form-delivery.constant';

/** Publish an Article to a connected Ghost, WordPress, Medium or Dev.to account. */
export interface IArticleDeliveryRequest {
  credentialId: string;
}

/** Deliver a Newsletter to a connected Beehiiv publication. */
export interface INewsletterDeliveryRequest {
  credentialId: string;
  mode: NewsletterDeliveryMode;
  /** ISO send time; required when `mode` is `schedule`. */
  scheduledDate?: string;
}
