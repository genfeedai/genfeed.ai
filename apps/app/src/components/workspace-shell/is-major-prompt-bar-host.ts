import { APP_ROUTE_PREFIXES } from '@genfeedai/contracts/constants';

/**
 * Studio and the legacy long-form editor already host a full prompt bar.
 * Product-page agent chrome must not add another prompt bar or chat bubble there.
 */
export function isMajorPromptBarHost(normalizedPathname: string): boolean {
  return (
    normalizedPathname === APP_ROUTE_PREFIXES.STUDIO ||
    normalizedPathname.startsWith(`${APP_ROUTE_PREFIXES.STUDIO}/`) ||
    normalizedPathname === APP_ROUTE_PREFIXES.EDIT ||
    normalizedPathname.startsWith(`${APP_ROUTE_PREFIXES.EDIT}/`)
  );
}
