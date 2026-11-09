import { AssetScope } from '@genfeedai/contracts';
import type {
  ClaimHandleClients,
  ClaimHandleOutcome,
} from '@/features/onboarding/props/claim-handle.props';

/**
 * Gives the handle someone claimed on genfeed.ai to the brand of their active
 * organization, once they are signed in. Taken or reserved handles fail on
 * the API (it checks access first, so nothing leaks); the brand then keeps its
 * current handle. A brand whose public profile is already live keeps its
 * handle, so links shared to it never break without the owner choosing to.
 * When the organization has several brands, none is picked for the owner:
 * they choose which one takes the handle in brand settings.
 */
export async function claimHandleAfterSignup(
  clients: ClaimHandleClients,
  handle: string,
): Promise<ClaimHandleOutcome> {
  const organizations = await clients.findOrganizations();
  const organization =
    organizations.find((candidate) => candidate.isActive) ?? organizations[0];
  if (!organization) {
    return 'no-brand';
  }
  const brands = await clients.findBrands(organization.id);
  if (brands.some((candidate) => candidate.slug === handle)) {
    return 'unchanged';
  }
  const [brand] = brands;
  if (!brand) {
    return 'no-brand';
  }
  if (brands.length > 1) {
    return 'several-brands';
  }
  if (brand.scope === AssetScope.PUBLIC) {
    return 'kept-public';
  }
  try {
    await clients.setHandle(brand.id, handle);
    return 'claimed';
  } catch {
    return 'unavailable';
  }
}
