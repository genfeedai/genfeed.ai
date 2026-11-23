import type {
  OrganizationOption,
  OrganizationOptionBrand,
} from '@genfeedai/contracts/interfaces';
import { mcpToolErrorResult } from '@mcp/tools/mcp-tool-error';

/**
 * Rejection for a call on a connection that covers several organizations and
 * names none. It lists every organization with its brands so the client can
 * retry with both, the way a missing brand is refused.
 */
export function organizationRequiredToolResult(
  organizations: readonly OrganizationOption[],
  brandsByOrganization: ReadonlyMap<string, OrganizationOptionBrand[]>,
) {
  const listing = organizations
    .map((organization) => {
      const brands = brandsByOrganization.get(organization.id) ?? [];
      const brandNames = brands.length
        ? brands.map((brand) => `${brand.label} (${brand.id})`).join(', ')
        : 'no brands';
      return `${organization.label} [${organization.slug}]: ${brandNames}`;
    })
    .join('; ');
  return mcpToolErrorResult({
    code: 'organization_required',
    message: `This connection covers ${organizations.length} organizations, so this call must name the one it acts in. Retry with organization set to a name, slug or id below, and brandId set to one of its brands. ${listing}.`,
    organizations: organizations.map(({ id, label, slug }) => ({
      brands: brandsByOrganization.get(id) ?? [],
      id,
      label,
      slug,
    })),
  });
}
