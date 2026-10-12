import { readOrganizationAutomationSettings } from '@api/collections/organization-settings/utils/organization-automation-settings.util';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { BrandReplicateVisionProvider } from '@api/services/brand-validation/brand-replicate-vision.provider';
import type {
  BrandDetectionOutcome,
  BrandDetectionRequest,
  BrandOcrOutcome,
  BrandOcrRequest,
  BrandVisualAnalysis,
} from '@api/services/brand-validation/brand-visual-analysis.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

/**
 * The gate in front of every paid reading of a branded visual. Two switches must both
 * be on, and both are off by default: the Admin platform setting
 * `isBrandVisualAnalysisEnabled` (the master kill switch) and the organization's own
 * `isBrandVisionChecksEnabled`, which its owners and admins turn on and pay for in credits.
 * While either is off nothing is called or paid and the caller leaves its checks unknown.
 * Any failure after that is `unavailable`, never a result.
 */
@Injectable()
export class BrandVisualAnalysisService implements BrandVisualAnalysis {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly platformSettings: PlatformSettingsService,
    private readonly provider: BrandReplicateVisionProvider,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Whether this organization may be charged for a reading right now: the platform
   * switch (the master kill switch, checked first and alone when off) and then the
   * organization's own `isBrandVisionChecksEnabled` (#6727). Both are read fresh on every
   * call, so the background job re-checks before it pays. Throws when a setting cannot
   * be read, so a caller that defers a reading can fail closed.
   */
  async isEnabled(organizationId: string): Promise<boolean> {
    const settings = await this.platformSettings.getFeatureSettings();
    if (!settings.isBrandVisualAnalysisEnabled) return false;
    return (
      await readOrganizationAutomationSettings(this.prisma, organizationId)
    ).isBrandVisionChecksEnabled;
  }

  async extractText(request: BrandOcrRequest): Promise<BrandOcrOutcome> {
    try {
      if (!(await this.isEnabled(request.scope.organizationId)))
        return { status: 'disabled' };
      const result = await this.provider.extractText(request);
      if (
        result.texts.length !== request.frames.length ||
        result.texts.some((text) => typeof text !== 'string')
      )
        return { status: 'unavailable' };
      return {
        provider: result.provider,
        status: 'read',
        texts: result.texts,
      };
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} OCR unavailable: ${getErrorMessage(error)}`,
        { brandId: request.scope.brandId },
      );
      return { status: 'unavailable' };
    }
  }

  async detectRegions(
    request: BrandDetectionRequest,
  ): Promise<BrandDetectionOutcome> {
    try {
      if (!(await this.isEnabled(request.scope.organizationId)))
        return { status: 'disabled' };
      const result = await this.provider.detectRegions(request);
      if (result.frames.length !== request.frames.length)
        return { status: 'unavailable' };
      return {
        frames: result.frames,
        provider: result.provider,
        status: 'detected',
      };
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} detection unavailable: ${getErrorMessage(error)}`,
        { brandId: request.scope.brandId },
      );
      return { status: 'unavailable' };
    }
  }
}
