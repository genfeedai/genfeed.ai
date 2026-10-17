import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentBrandSerializedData } from '@genfeedai/serializers';

/** Brands listed in the account profile; `brandCount` carries the total. */
const ACCOUNT_BRAND_LIMIT = 25;

export interface AgentAccountIdentityDeps {
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
