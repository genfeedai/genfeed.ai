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
  const [brand] = await clients.findBrands(organization.id);
  if (!brand) {
    return 'no-brand';
  }
  if (brand.slug === handle) {
    return 'unchanged';
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
