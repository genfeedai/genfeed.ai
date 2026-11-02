export interface OrganizationLibraryProps {
  organizationId: string;
}

/** Where the next page starts: a keyset cursor, or a page number for orders the API cannot keyset-page. */
export type OrganizationLibraryPageParam =
  | { cursor: string }
  | { page: number }
  | null;
