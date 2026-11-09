import type { IBrandSubscriberImportSummary } from '@genfeedai/contracts/interfaces';
import type { Newsletter } from '@genfeedai/models/content/newsletter.model';

export interface NewsletterSubscribersFilter {
  page: number;
  search: string;
  status: string | null;
}

export interface NewsletterAudienceDialogProps {
  brandId: string;
  onClose: () => void;
  onDone: (summary: IBrandSubscriberImportSummary) => void;
}

export interface NewsletterImportSummaryProps {
  summary: IBrandSubscriberImportSummary;
}

export interface NewsletterBrandGateProps {
  title: string;
}

export interface NewsletterSendCardProps {
  isDirty: boolean;
  newsletter: Newsletter;
}

/** Analytics window; every number on the page follows it. */
/** ISO instants; `refreshKey` bumps when the Analytics refresh button is hit. */
export interface NewsletterAnalyticsRange {
  from: string;
  to: string;
  refreshKey: number;
}

export interface NewsletterLinkRow {
  id: string;
  url: string;
  subject: string;
  uniqueClicks: number;
  totalClicks: number;
}

export interface NewsletterImportFile {
  csv: string;
  name: string;
}

/** The settings form keeps text inputs as strings until save. */
export interface NewsletterSettingsForm {
  senderName: string;
  replyTo: string;
  postalAddress: string;
  footerText: string;
  isAttributionEnabled: boolean;
  isWelcomeEnabled: boolean;
  welcomeSubject: string;
  welcomeBody: string;
  paidPriceCredits: string;
}
