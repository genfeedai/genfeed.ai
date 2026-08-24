import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import type {
  InstallReadinessResponse,
  OnboardingWorkspaceContext,
} from '@api/endpoints/onboarding/onboarding.interfaces';
import { withOnboardingErrorHandling } from '@api/endpoints/onboarding/services/onboarding-error.util';
import { OnboardingPreviewService } from '@api/endpoints/onboarding/services/onboarding-preview.service';
import { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import type { OrganizationCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * OnboardingService
 *
 * Genuine onboarding actions only: workspace resolution/provisioning, status +
 * install readiness, preview generation, and the organization prefix.
 *
 * The resource-shaped brand/user writes that briefly lived here (brand setup +
 * scrape, brand rename→org cascade, reference images, funnel completion) were
 * dissolved into their canonical resource modules per REST audit #1354 — brand
 * writes to `BrandsModule` (`BrandSetupService`) and funnel completion to
 * `UsersController`. That removed the
 * OnboardingModule ↔ Brands/Users import cycles: OnboardingModule is now only
 * imported by the root module and can no longer be part of a dependency cycle.
 */
@Injectable()
export class OnboardingService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly membersService: MembersService,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly userSetupService: UserSetupService,
    private readonly onboardingPreviewService: OnboardingPreviewService,
    private readonly onboardingReadinessService: OnboardingReadinessService,
  ) {}

  private getEntityId(record: unknown): string {
    if (!record || typeof record !== 'object') {
      return '';
    }

    const entity = record as Record<string, unknown>;
    const id = entity.id;

    return typeof id === 'string' ? id : '';
  }

  private async ensureOnboardingWorkspace(
    user: User,
    category?: OrganizationCategory,
  ): Promise<OnboardingWorkspaceContext> {
    let userId = (user.userId ?? user.id)?.toString() ?? '';

    let dbUser = userId
      ? await this.usersService.findOne({ id: userId, isDeleted: false }, [])
      : null;

    if (!dbUser && user.id) {
      dbUser = await this.usersService.findOne(
        { id: user.id, isDeleted: false },
        [],
      );
    }

    userId = this.getEntityId(dbUser) || userId;
    if (!userId) {
      throw new HttpException(
        {
          detail: 'Missing local user account for the authenticated subject',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let brandId: string | null = user.brandId?.toString() ?? null;
    const members = await this.membersService.findActiveForUserAccess(userId);
    const membershipOrgIds = [
      ...new Set(
        members
          .map((member) => member.organizationId)
          .filter((organizationId): organizationId is string =>
            Boolean(organizationId),
          ),
      ),
    ];

    const lastUsedOrganizationId =
      (
        dbUser as { lastUsedOrganizationId?: string | null } | null
      )?.lastUsedOrganizationId?.toString() ?? '';
    const sessionOrganizationId = user.organizationId?.toString() ?? '';

    // Membership is the source of truth. A stale session / lastUsed org that
    // the user no longer belongs to must not be persisted back onto identity.
    let organizationId = '';
    if (
      sessionOrganizationId &&
      membershipOrgIds.includes(sessionOrganizationId)
    ) {
      organizationId = sessionOrganizationId;
    } else if (
      lastUsedOrganizationId &&
      membershipOrgIds.includes(lastUsedOrganizationId)
    ) {
      organizationId = lastUsedOrganizationId;
    } else {
      organizationId = membershipOrgIds[0] ?? '';
    }

    if (!organizationId) {
      const setupResult = await this.userSetupService.initializeUserResources(
        userId,
        category,
        {
          email: (dbUser as { email?: string | null } | null)?.email,
          name: (dbUser as { name?: string | null } | null)?.name,
        },
      );

      organizationId = this.getEntityId(setupResult.organization);
      brandId = this.getEntityId(setupResult.brand) || null;
    }

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Unable to resolve an accessible organization for onboarding',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      // Persist the active org to the DB so both identity resolvers route to it
      // (epic #735, Phase C — no legacy auth provider write-back). Brand resolves from the
      // member's lastUsedBrandId / org default.
      await this.usersService.patch(userId, {
        lastUsedOrganizationId: organizationId,
      });
    } catch (error: unknown) {
      this.loggerService.warn(
        'Failed to set active organization during onboarding',
        {
          error: error instanceof Error ? error.message : error,
          organizationId,
          userId,
        },
      );
    }

    return { brandId, organizationId, userId };
  }

  /**
   * Get onboarding status for user
   */
  async getOnboardingStatus(
    user: User,
  ): Promise<{ isFirstLogin: boolean; hasCompletedOnboarding: boolean }> {
    const { organizationId } = await this.ensureOnboardingWorkspace(user);

    return this.onboardingReadinessService.getOnboardingStatus(organizationId);
  }

  async getInstallReadiness(user: User): Promise<InstallReadinessResponse> {
    const workspace = await this.ensureOnboardingWorkspace(user);

    return this.onboardingReadinessService.getInstallReadiness(user, workspace);
  }

  async getProactiveWorkspace(_user: User): Promise<{
    success: boolean;
    proactiveStatus: string;
    prepPercent: number;
    prepStage: string;
    brand?: unknown;
    organization?: unknown;
    outputs: unknown[];
    summary: string;
  }> {
    // This metadata had no writers, so this endpoint always returned this
    // exact error. Preserve that behavior in this strictly subtractive cleanup;
    // a live proactive-workspace replacement is separate product work.
    throw new HttpException(
      {
        detail: 'Missing proactive onboarding context',
        title: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  async claimProactiveWorkspace(_user: User): Promise<{
    success: boolean;
    proactiveStatus: string;
    prepPercent: number;
    prepStage: string;
    brand?: unknown;
    organization?: unknown;
    outputs: unknown[];
    summary: string;
    claimedAt?: Date;
  }> {
    // Preserve the pre-cleanup response contract; see getProactiveWorkspace.
    throw new HttpException(
      {
        detail: 'Missing proactive onboarding context',
        title: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Generate an AI preview image during onboarding
   */
  async generateOnboardingPreview(
    dto: GeneratePreviewDto,
    user: User,
  ): Promise<{ imageUrl: string; prompt: string }> {
    return this.onboardingPreviewService.generateOnboardingPreview(dto, user);
  }

  /**
   * Check if a prefix is available
   */
  async checkPrefixAvailable(prefix: string): Promise<boolean> {
    return this.organizationsService.isPrefixAvailable(prefix);
  }

  /**
   * Set the organization's unique prefix (immutable once set)
   */
  async setPrefix(
    user: User,
    prefix: string,
  ): Promise<{ success: boolean; message: string; prefix: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { prefix });

    const organizationId = user.organizationId;

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        detail: 'Failed to set organization prefix',
        hasHttpExceptionPassthrough: true,
        title: 'Error',
      },
      async () => {
        // Check if org already has a prefix
        const org = await this.organizationsService.findOne({
          id: organizationId,
          isDeleted: false,
        });

        if (!org) {
          throw new HttpException(
            { detail: 'Organization not found', title: 'Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        if (org.prefix) {
          throw new HttpException(
            {
              detail: `Organization already has prefix "${org.prefix}". Prefix is immutable once set.`,
              title: 'Conflict',
            },
            HttpStatus.CONFLICT,
          );
        }

        // Check uniqueness
        const isAvailable =
          await this.organizationsService.isPrefixAvailable(prefix);
        if (!isAvailable) {
          throw new HttpException(
            {
              detail: `Prefix "${prefix}" is already taken`,
              title: 'Conflict',
            },
            HttpStatus.CONFLICT,
          );
        }

        // Set the prefix. `prefix` is inherited on UpdateOrganizationDto via
        // PartialType(CreateOrganizationDto) — immutability is enforced above
        // at runtime, not via DTO-level field exclusion (REST audit #1354).
        await this.organizationsService.patch(organizationId.toString(), {
          prefix: prefix.toUpperCase(),
        });

        this.loggerService.log(`${caller} completed`, { prefix });

        return {
          message: `Organization prefix set to "${prefix.toUpperCase()}"`,
          prefix: prefix.toUpperCase(),
          success: true,
        };
      },
    );
  }
}
