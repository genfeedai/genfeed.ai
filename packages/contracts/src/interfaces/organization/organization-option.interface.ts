export interface OrganizationOptionBrand {
  id: string;
  label: string;
}

export interface OrganizationOption {
  brand: OrganizationOptionBrand | null;
  id: string;
  isActive: boolean;
  isOwner: boolean;
  label: string;
  /** Uploaded organization logo, absolute CDN URL. */
  logoUrl: string | null;
  slug: string;
}
