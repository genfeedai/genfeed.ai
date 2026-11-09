import type { BrandSubscriberPublicSource } from '@genfeedai/contracts/constants';
import type {
  IPublicNewsletterArchive,
  IPublicNewsletterIssue,
  IPublicNewsletterIssueSummary,
} from '@genfeedai/contracts/interfaces';
import type { Brand } from '@models/organization/brand.model';

export interface NewsletterSubscribeFormProps {
  /** The brand whose newsletter the reader joins. */
  brandId?: string;
  /**
   * A public profile handle, resolved to a brand only when someone submits,
   * for pages that render before they know the brand (the site footer).
   */
  brandHandle?: string;
  source: BrandSubscriberPublicSource;
  /** The article, post or issue the form sits on. */
  sourceRef?: string;
  title?: string;
  description?: string;
  className?: string;
}

export interface NewsletterIssueListProps {
  issues: IPublicNewsletterIssueSummary[];
}

export interface NewsletterIssueMetaProps {
  issue: IPublicNewsletterIssueSummary;
}

export interface NewsletterArchiveContentProps {
  /** Null when the archive could not be loaded right now. */
  archive: IPublicNewsletterArchive | null;
  bannerUrl?: string;
  logoUrl?: string;
  page: number;
}

export interface NewsletterIssueContentProps {
  issue: IPublicNewsletterIssue;
}

export interface NewsletterArchiveRouteProps {
  searchParams: Promise<{ page?: string }>;
}

export interface NewsletterIssueRouteProps {
  params: Promise<{ id: string }>;
}

export interface GenfeedNewsletterArchive {
  archive: IPublicNewsletterArchive | null;
  brand: Brand | null;
}
