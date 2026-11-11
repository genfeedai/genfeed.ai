import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentBrandSerializedData } from '@genfeedai/serializers';

/** Brands listed in the account profile; `brandCount` carries the total. */
const ACCOUNT_BRAND_LIMIT = 25;

/**
 * Said when an organization has brands but the caller can use none of them.
 * It never suggests creating a brand: the brands exist, access is what is missing.
 */
export const BRAND_ACCESS_MISSING_MESSAGE =
  'You have no brand access in this organization. It has brands, but none are assigned to you or to this API key. Ask an organization owner or admin to give you access to a brand.';

export interface AgentAccountIdentityDeps {
  /** Brands in the organization, whatever the caller may use. Undefined when unknown. */
  countOrganizationBrands?: (
    ctx: ToolExecutionContext,
  ) => Promise<number | undefined>;
  listBrands: (
    ctx: ToolExecutionContext,
  ) => Promise<AgentBrandSerializedData[]>;
  organizationsService?: OrganizationsService;
  usersService?: UsersService;
}

/**
 * The names a client shows for `get_account`: organization, brands and the
 * onboarding flag. Every lookup fails soft, so a field is omitted when it can't
 * be resolved and a transient error is never reported as "no brands".
 */
export async function readAccountIdentity(
  deps: AgentAccountIdentityDeps,
  ctx: ToolExecutionContext,
  brandId: string | undefined,
): Promise<Record<string, unknown>> {
  const [isOnboardingCompleted, organization, brands] = await Promise.all([
    readOnboardingCompleted(deps.usersService, ctx),
    readOrganizationIdentity(deps.organizationsService, ctx),
    deps.listBrands(ctx).catch(() => undefined),
  ]);
  const organizationBrandCount =
    brands?.length === 0
      ? await deps.countOrganizationBrands?.(ctx)
      : undefined;
  const hasMissingBrandAccess =
    organizationBrandCount !== undefined && organizationBrandCount > 0;
  const brandName = brandId
    ? brands?.find((brand) => brand.id === brandId)?.name
    : undefined;
  return {
    ...(brandName ? { brandName } : {}),
    ...(brands
      ? {
          brandCount: brands.length,
          brands: brands
            .slice(0, ACCOUNT_BRAND_LIMIT)
            .map(({ id, name }) => ({ id, name })),
        }
      : {}),
    ...(hasMissingBrandAccess
      ? {
          brandAccessMessage: BRAND_ACCESS_MISSING_MESSAGE,
          organizationBrandCount,
        }
      : {}),
    ...(isOnboardingCompleted === undefined ? {} : { isOnboardingCompleted }),
    ...(organization?.name ? { organizationName: organization.name } : {}),
    ...(organization?.slug ? { organizationSlug: organization.slug } : {}),
  };
}

/** The organization's display name and slug. Omitted when unresolved. */
async function readOrganizationIdentity(
  organizationsService: OrganizationsService | undefined,
  ctx: ToolExecutionContext,
): Promise<{ name?: string; slug?: string } | undefined> {
  if (!organizationsService) {
    return undefined;
  }
  try {
    const organization = await organizationsService.findOne({
      id: ctx.organizationId,
      isDeleted: false,
    });
    const name = organization?.label?.trim();
    const slug = organization?.slug?.trim();
    return {
      ...(name ? { name } : {}),
      ...(slug ? { slug } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * Whether the caller finished first-run onboarding. An MCP client that signed
 * up during the OAuth connect never sees the web onboarding, so it reads this
 * to know it must run `onboard_brand` first. Omitted when unresolved.
 */
async function readOnboardingCompleted(
  usersService: UsersService | undefined,
  ctx: ToolExecutionContext,
): Promise<boolean | undefined> {
  if (!usersService) {
    return undefined;
  }
  try {
    const user = await usersService.findOne({ id: ctx.userId });
    return user ? user.isOnboardingCompleted === true : undefined;
  } catch {
    return undefined;
  }
}
