import { createEntityAttributes } from '@genfeedai/helpers';

/** The address is returned only to members of the owning organization. */
export const brandSubscriberAttributes = createEntityAttributes([
  'brandId',
  'email',
  'name',
  'tags',
  'status',
  'source',
  'sourceRef',
  'consentMethod',
  'consentAt',
  'confirmedAt',
  'unsubscribedAt',
  'bouncedAt',
  'complainedAt',
]);

export const newsletterSendAttributes = createEntityAttributes([
  'brandId',
  'newsletterId',
  'status',
  'scheduledFor',
  'startedAt',
  'completedAt',
  'canceledAt',
  'subject',
  'recipientCount',
  'sentCount',
  'failedCount',
  'skippedCount',
]);

export const newsletterSettingsAttributes = createEntityAttributes([
  'brandId',
  'senderName',
  'replyTo',
  'postalAddress',
  'footerText',
  'isWelcomeEnabled',
  'welcomeSubject',
  'welcomeBody',
  'isAttributionEnabled',
  'paidPriceCredits',
]);
