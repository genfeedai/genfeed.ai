export interface AdminOrgBrandFilterProps {
  organization: string;
  brand: string;
  onOrganizationChange: (orgId: string) => void;
  onBrandChange: (brandId: string) => void;
}

export interface AdminScopeFilterProps {
  label: string;
  value: string;
  isLoading: boolean;
  options: { id: string; label: string; logoUrl?: string | null }[];
  onChange: (id: string) => void;
}
