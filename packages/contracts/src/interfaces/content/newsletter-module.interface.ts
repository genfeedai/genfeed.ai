import type {
  BrandSubscriberPublicSource,
  BrandSubscriberStatus,
  NewsletterPlanKey,
  NewsletterSendStatus,
} from '../../constants/newsletter-module.constant';

/** One parsed CSV row that failed validation. */
export interface IBrandSubscriberInvalidRow {
  row: number;
  value: string;
}

/**
 * Outcome of an "add by email" request or a CSV import. A preview reports the
 * same counts without writing anything.
 */
export interface IBrandSubscriberImportSummary {
  importId: string | null;
  isPreview: boolean;
  totalRows: number;
  added: number;
  duplicate: number;
  invalid: number;
  suppressed: number;
  /** Addresses needing the double opt-in email (owner did not attest consent). */
  pendingConfirmation: number;
  /** First invalid rows, capped, so the owner can fix the file. */
  invalidRows: IBrandSubscriberInvalidRow[];
  /** First valid rows, capped, for the import preview. */
  previewRows: IBrandSubscriberPreviewRow[];
}

export interface IBrandSubscriberPreviewRow {
  email: string;
  name: string | null;
  tags: string[];
}

export interface IBrandSubscriberStats {
  total: number;
  active: number;
  pending: number;
  unsubscribed: number;
  bounced: number;
  complained: number;
}

/** Plan usage for the Subscribers and Settings pages (Cloud runtime gate). */
export interface INewsletterUsage {
  plan: NewsletterPlanKey | 'unlimited';
  subscribers: number;
  subscriberLimit: number | null;
  emailsThisMonth: number;
  emailLimit: number | null;
}

export interface INewsletterSendReport {
  id: string;
  newsletterId: string;
  subject: string;
  status: NewsletterSendStatus;
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  recipientCount: number;
  sent: number;
  delivered: number;
  uniqueOpens: number;
  totalOpens: number;
  uniqueClicks: number;
  totalClicks: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
}

export interface INewsletterLinkReport {
  sendId: string;
  subject: string;
  index: number;
  url: string;
  uniqueClicks: number;
  totalClicks: number;
}

export interface INewsletterGrowthPoint {
  date: string;
  subscribed: number;
  unsubscribed: number;
  net: number;
}

export interface INewsletterSourceCount {
  source: string;
  count: number;
}

export interface INewsletterActivityItem {
  type: 'subscribed' | 'unsubscribed' | 'opened' | 'clicked' | 'bounced';
  occurredAt: string;
  subject: string | null;
}

export interface INewsletterAnalyticsTotals {
  subscribers: number;
  activeSubscribers: number;
  sends: number;
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  unsubscribed: number;
  bounced: number;
  complained: number;
  /** Unique opens over delivered; an estimate, since mail clients preload images. */
  openRate: number;
  clickRate: number;
}

export interface INewsletterAnalytics {
  from: string;
  to: string;
  totals: INewsletterAnalyticsTotals;
  sends: INewsletterSendReport[];
  topLinks: INewsletterLinkReport[];
  growth: INewsletterGrowthPoint[];
  sources: INewsletterSourceCount[];
  recentActivity: INewsletterActivityItem[];
}

export interface IPublicNewsletterSubscribeRequest {
  brandId: string;
  email: string;
  name?: string;
  source?: BrandSubscriberPublicSource;
  sourceRef?: string;
}

export interface IPublicNewsletterSubscribeResponse {
  /** Always `confirmation_sent` so the form never reveals who is subscribed. */
  status: 'confirmation_sent';
}

/** Rendered email, for the in-app preview and the test send. */
export interface INewsletterEmailPreview {
  subject: string;
  html: string;
  text: string;
}

export interface IBrandSubscriberListFilter {
  status?: BrandSubscriberStatus;
  tag?: string;
  search?: string;
}
