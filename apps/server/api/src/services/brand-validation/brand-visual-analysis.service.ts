import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { BrandReplicateVisionProvider } from '@api/services/brand-validation/brand-replicate-vision.provider';
import type {
  BrandDetectionOutcome,
  BrandDetectionRequest,
  BrandOcrOutcome,
  BrandOcrRequest,
  BrandVisualAnalysis,
} from '@api/services/brand-validation/brand-visual-analysis.types';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

/**
 * The gate in front of every paid reading of a branded visual. The Admin
 * platform setting `isBrandVisualAnalysisEnabled` is off by default; while it is
 * off nothing is called or paid and the caller leaves its checks unknown. Any
 * failure after that is `unavailable`, never a result.
 */
@Injectable()
export class BrandVisualAnalysisService implements BrandVisualAnalysis {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly platformSettings: PlatformSettingsService,
    private readonly provider: BrandReplicateVisionProvider,
    private readonly logger: LoggerService,
  ) {}

  async extractText(request: BrandOcrRequest): Promise<BrandOcrOutcome> {
    try {
      const settings = await this.platformSettings.getFeatureSettings();
      if (!settings.isBrandVisualAnalysisEnabled) return { status: 'disabled' };
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
      const settings = await this.platformSettings.getFeatureSettings();
      if (!settings.isBrandVisualAnalysisEnabled) return { status: 'disabled' };
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
