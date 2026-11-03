export interface AdminOrgBrandFilterProps {
  organization: string;
  brand: string;
  onOrganizationChange: (orgId: string) => void;
  onBrandChange: (brandId: string) => void;
}

export interface AdminScopeFilterProps {
  /** Sits inside a `SearchField`'s trailing edge: a compact trigger. */
  isAttached?: boolean;
}
