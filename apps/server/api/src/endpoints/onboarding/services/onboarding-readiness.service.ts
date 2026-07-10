import { spawnSync } from 'node:child_process';
import process from 'node:process';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import type {
  InstallReadinessResponse,
  OnboardingWorkspaceContext,
} from '@api/endpoints/onboarding/onboarding.interfaces';
import { isCloudDeployment, isEEEnabled } from '@genfeedai/config';
import type {
  IOnboardingAccessPreference,
  IOrganizationSetting,
  OnboardingAccessMode,
  OnboardingRuntimeAccessMode,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * OnboardingReadinessService
 *
 * Owns environment/CLI readiness probing and status reads for onboarding:
 * provider env keys, local CLI detection, BYOK configuration, and the
 * install-readiness aggregate.
 */
@Injectable()
export class OnboardingReadinessService {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
  ) {}

  private isConfigured(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  getProviderReadiness() {
    const replicate = this.isConfigured(process.env.REPLICATE_KEY);
    const fal = this.isConfigured(process.env.FAL_API_KEY);
    const openai = this.isConfigured(process.env.OPENAI_API_KEY);
    const configured = [
      replicate ? 'replicate' : null,
      fal ? 'fal' : null,
      openai ? 'openai' : null,
    ].filter((value): value is string => value !== null);

    return {
      anyConfigured: configured.length > 0,
      configured,
      fal,
      imageGenerationReady: fal || replicate,
      openai,
      replicate,
      textGenerationReady: openai,
    };
  }

  private isCommandAvailable(command: string): boolean {
    const result = spawnSync(command, ['--version'], {
      encoding: 'utf8',
      shell: false,
      stdio: 'ignore',
    });

    if (result.error) {
      return false;
    }

    return result.status === 0;
  }

  getLocalToolReadiness() {
    if (isCloudDeployment()) {
      return { anyDetected: false, claude: false, codex: false, detected: [] };
    }

    const claude = this.isCommandAvailable('claude');
    const codex = this.isCommandAvailable('codex');
    const detected = [claude ? 'claude' : null, codex ? 'codex' : null].filter(
      (value): value is string => value !== null,
    );

    return {
      anyDetected: detected.length > 0,
      claude,
      codex,
      detected,
    };
  }

  private normalizeAccessMode(value: unknown): OnboardingAccessMode | null {
    if (value === 'server' || value === 'byok' || value === 'cloud') {
      return value;
    }

    return null;
  }

  private getSelectedAccessMode(
    dashboardPreferences?: unknown,
  ): OnboardingAccessMode | null {
    if (!dashboardPreferences || typeof dashboardPreferences !== 'object') {
      return null;
    }

    const onboarding = (
      dashboardPreferences as { onboarding?: IOnboardingAccessPreference }
    ).onboarding;

    return this.normalizeAccessMode(onboarding?.accessMode);
  }

  private getConfiguredByokProviders(
    organizationSettings?: Pick<IOrganizationSetting, 'byokKeys'> | null,
  ): string[] {
    const byokKeys = organizationSettings?.byokKeys;

    if (!byokKeys || typeof byokKeys !== 'object') {
      return [];
    }

    return Object.entries(byokKeys).flatMap(([providerKey, entry]) => {
      if (!entry?.isEnabled || !entry.apiKey?.trim()) {
        return [];
      }

      const provider =
        typeof entry.provider === 'string' && entry.provider.trim()
          ? entry.provider
          : providerKey;

      return [provider];
    });
  }

  /**
   * Get onboarding status for an organization
   */
  async getOnboardingStatus(
    organizationId: string,
  ): Promise<{ isFirstLogin: boolean; hasCompletedOnboarding: boolean }> {
    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    return {
      hasCompletedOnboarding: settings?.isFirstLogin === false,
      isFirstLogin: settings?.isFirstLogin ?? true,
    };
  }

  async getInstallReadiness(
    user: User,
    workspace: OnboardingWorkspaceContext,
  ): Promise<InstallReadinessResponse> {
    const organizationId = workspace.organizationId;
    const brandId = workspace.brandId;
    const userId = workspace.userId;
    const providers = this.getProviderReadiness();
    const showBillingUi = isEEEnabled();

    let hasOrganization = false;
    let hasBrand = false;
    let selectedMode: OnboardingAccessMode | null = null;
    let organizationSettings: Pick<
      IOrganizationSetting,
      'byokKeys' | 'isByokEnabled'
    > | null = null;

    if (userId && /^[0-9a-f]{24}$/i.test(userId)) {
      const dbUser = await this.usersService.findOne({
        _id: userId,
        isDeleted: false,
      });

      selectedMode = this.getSelectedAccessMode(
        (dbUser?.settings as { dashboardPreferences?: unknown } | undefined)
          ?.dashboardPreferences,
      );
    }

    if (organizationId && /^[0-9a-f]{24}$/i.test(organizationId)) {
      const organization = await this.organizationsService.findOne({
        _id: organizationId,
        isDeleted: false,
      });

      hasOrganization = !!organization;

      if (organization) {
        const [brand, settings] = await Promise.all([
          this.brandsService.findOne({
            isDeleted: false,
            organization: organization.id,
          }),
          this.organizationSettingsService.findOne({
            isDeleted: false,
            organization: organization.id,
          }),
        ]);

        hasBrand = !!brand;
        organizationSettings = settings as unknown as Pick<
          IOrganizationSetting,
          'byokKeys' | 'isByokEnabled'
        >;
      }
    }

    const byokConfiguredProviders =
      this.getConfiguredByokProviders(organizationSettings);
    const runtimeMode: OnboardingRuntimeAccessMode =
      byokConfiguredProviders.length > 0 ? 'byok' : 'server';
    const byokEnabled =
      Boolean(organizationSettings?.isByokEnabled) ||
      byokConfiguredProviders.length > 0;

    return {
      access: {
        byokConfiguredProviders,
        byokEnabled,
        runtimeMode,
        selectedMode,
        serverDefaultsReady: providers.anyConfigured,
      },
      authMode: user.id ? 'better_auth' : 'none',
      billingMode: showBillingUi ? 'cloud_billing' : 'oss_local',
      localTools: this.getLocalToolReadiness(),
      providers,
      ui: {
        showBilling: showBillingUi,
        showCloudUpgradeCta: !showBillingUi,
        showCredits: showBillingUi,
        showLocalTools: !isCloudDeployment(),
        showPricing: showBillingUi,
      },
      workspace: {
        brandId,
        hasBrand,
        hasOrganization,
        organizationId,
      },
    };
  }
}
