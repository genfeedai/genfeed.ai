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
  /**
   * Settings context currently on screen. Search only indexes that scope —
   * personal never lists org/brand pages. Scope switching is the org/brand
   * switcher, same as the settings sidebar.
   */
  scope: SettingsSearchScope;
  showCredits?: boolean;
}

export interface SettingsSearchHrefContext {
  brandSlug: string;
  orgSlug: string;
}

export interface SettingsSearchProps {
  className?: string;
  scope: SettingsSearchScope;
}
