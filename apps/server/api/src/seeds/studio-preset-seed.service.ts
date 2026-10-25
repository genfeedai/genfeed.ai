import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory } from '@genfeedai/contracts';
import { AD_PRESETS } from '@genfeedai/contracts/constants/ad-presets.constant';
import { STUDIO_SYSTEM_PRESETS } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type StudioPresetSeedResult = {
  unchanged: number;
  written: number;
};

const catalog = [
  ...STUDIO_SYSTEM_PRESETS,
  ...AD_PRESETS.map((preset) => ({
    ...preset,
    prompt: '',
    type: 'video' as const,
    values: { adPreset: preset },
  })),
];

@Injectable()
export class StudioPresetSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async reconcileCatalog(): Promise<StudioPresetSeedResult> {
    const result: StudioPresetSeedResult = { unchanged: 0, written: 0 };
    const failedKeys: string[] = [];
    for (const preset of catalog) {
      try {
        if (await this.seedPreset(preset)) result.written += 1;
        else result.unchanged += 1;
      } catch (error) {
        failedKeys.push(preset.key);
        this.logger.error(
          `Studio system preset seed failed for ${preset.key}`,
          error instanceof Error ? error : new Error(String(error)),
          'StudioPresetSeedService',
        );
      }
    }
    if (failedKeys.length > 0) {
      throw new Error(
        `Studio system preset reconcile failed for: ${failedKeys.join(', ')}`,
      );
    }
    return result;
  }

  private async seedPreset(preset: (typeof catalog)[number]): Promise<boolean> {
    const id = `cpresetbuiltin${preset.key.replaceAll('-', '')}`;
    // tenant-scope-ignore: reserved platform seed ID collision probe; tenant rows are never rewritten, including deleted rows.
    const existing = await this.prisma.preset.findUnique({
      where: { id },
      select: { organizationId: true, brandId: true },
    });
    if (existing) return false;
    const category = {
      image: ModelCategory.IMAGE,
      'image-edit': ModelCategory.IMAGE_EDIT,
      video: ModelCategory.VIDEO,
    }[preset.type];
    const config = {
      key: preset.key,
      label: preset.label,
      description: preset.description,
      prompt: preset.prompt,
      ...preset.values,
    };
    // tenant-scope-ignore: platform seed owns only null organization/brand rows
    await this.prisma.preset.create({
      data: {
        id,
        organizationId: null,
        brandId: null,
        category,
        config,
        isActive: true,
      },
    });
    return true;
  }
}
