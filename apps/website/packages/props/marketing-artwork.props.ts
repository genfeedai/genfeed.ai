export interface MarketingArtworkProps {
  kind:
    | 'campaign'
    | 'creator'
    | 'integration'
    | 'publishing'
    | 'workflow'
    | 'research';
  isCompact?: boolean;
}
