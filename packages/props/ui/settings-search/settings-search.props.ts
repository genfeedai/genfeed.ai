export type SettingsSearchScope = 'personal' | 'organization' | 'brand';

export interface SettingsSearchItem {
  description: string;
  group: string;
  href: string;
  id: string;
  keywords: string[];
  label: string;
  scope: SettingsSearchScope;
}

export interface SettingsSearchCatalogOptions {
  isEnterprise?: boolean;
  showCredits?: boolean;
}

export interface SettingsSearchHrefContext {
  brandSlug: string;
  orgSlug: string;
}

export interface SettingsSearchProps {
  className?: string;
}
