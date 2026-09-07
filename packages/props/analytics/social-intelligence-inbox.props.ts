export interface SocialIntelligenceInboxProps {
  brandId?: string;
  organizationId: string;
}

export interface ThemeCoverage {
  included: string[];
  missing: string[];
  partial: boolean;
  reason: string | null;
}
