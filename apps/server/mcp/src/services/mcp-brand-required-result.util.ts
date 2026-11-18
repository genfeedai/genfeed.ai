import type { McpBrandOption } from '@genfeedai/actions';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getPublicAppUrl } from '@mcp/mcp/setup-page';
import { mcpToolErrorResult } from '@mcp/tools/mcp-tool-error';

function listBrandLabels(
  brands: readonly McpBrandOption[],
  withIds: boolean,
): string {
  return brands
    .map((brand) => {
      if (brand.label === brand.id) return 'Unnamed brand';
      return withIds ? `${brand.label} (${brand.id})` : brand.label;
    })
    .join(', ');
}

/**
 * Rejection for a generation that names no brand (#5786). `undefined` means
 * the caller's brands could not be loaded.
 */
export function brandRequiredToolResult(brands: McpBrandOption[] | undefined) {
  if (!brands) {
    return mcpToolErrorResult({
      brands: [],
      code: 'brand_required',
      message:
        'Choose a brand for this generation. Your brands could not be loaded right now: call get_brands, then retry with its brandId.',
    });
  }
  if (brands.length === 0) {
    return mcpToolErrorResult({
      brands,
      code: 'brand_required',
      message:
        'You have no brand to generate for yet. Create a brand in Genfeed (Settings > Brands), or ask an organization admin to create one and give you access, then retry.',
      nextStepUrl: `${getPublicAppUrl()}${APP_ROUTES.SETTINGS.BRANDS}`,
    });
  }
  return mcpToolErrorResult({
    brands,
    code: 'brand_required',
    message: `Choose a brand for this generation. Available brands: ${listBrandLabels(brands, false)}.`,
  });
}

/** Rejection for a draft that names no brand when the organization has several (#10071). */
export function brandChoiceToolResult(brands: McpBrandOption[]) {
  return mcpToolErrorResult({
    brands,
    code: 'brand_required',
    message: `Choose a brand for this draft: pass its id as brandId. Available brands: ${listBrandLabels(brands, true)}.`,
  });
}
