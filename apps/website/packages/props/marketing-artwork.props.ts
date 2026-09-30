export interface MarketingArtworkProps {
  page?: string;
  kind?:
    | 'campaign'
    | 'creator'
    | 'integration'
    | 'publishing'
    | 'workflow'
    | 'research';
  isCompact?: boolean;
}
