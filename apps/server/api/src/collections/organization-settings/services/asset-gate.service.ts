import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * First-asset unlock gate — org signal writer.
 *
 * Flips `OrganizationSetting.hasGeneratedFirstAsset` true the first time an org
 * completes a generation (an Ingredient entering `GENERATED`). The auth bootstrap
 * payload reads the flag to unlock the main app nav sections (cloud SaaS only).
 *
 * Mirrors the durable `hasEverHadCredits` idiom
 * (credits.utils.service.ts#markOrganizationAsHavingCredits) but uses an atomic,
 * monotonic conditional update so concurrent generation completions can't double
 * -write or race the read-then-patch, and so the access cache is invalidated
 * exactly once (only on the transition).
 */
@Injectable()
export class AssetGateService {
  private readonly context = { service: AssetGateService.name };

  constructor(
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Idempotent + best-effort. Callers should `await` this before publishing
   * generation-success to the client (so the unlocked bootstrap is ready), but a
   * failure here MUST NOT break generation — it is caught and logged.
   */
  async markFirstAssetGenerated(organizationId?: string | null): Promise<void> {
    if (!organizationId) {
      return;
    }

    try {
      // Atomic false -> true transition. `modifiedCount` is 0 when the flag was
      // already set (or the org has no settings row), so we invalidate the
      // access-bootstrap cache exactly once, on the org's first asset.
      const { modifiedCount } = await this.organizationSettingsService.patchAll(
        {
          hasGeneratedFirstAsset: false,
          isDeleted: false,
          organizationId,
        },
        { hasGeneratedFirstAsset: true },
      );

      if (modifiedCount > 0) {
        await this.accessBootstrapCacheService.invalidateForOrganization(
          organizationId,
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `markFirstAssetGenerated failed for organization ${organizationId}`,
        { ...this.context, error },
      );
    }
  }
}
