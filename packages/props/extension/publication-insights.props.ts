import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';

export interface PublicationInsightDetailsProps {
  insight: PublicationInsight;
  isBusy: boolean;
  error: string | null;
  notice: string | null;
  connectHref: string | null;
  onRefresh: () => void;
  onLink: (credentialId: string) => void;
}
