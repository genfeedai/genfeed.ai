import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  STUDIO_SYSTEM_PRESETS,
  studioSystemPresetId,
} from '@genfeedai/contracts/constants/studio-system-presets.constant';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class StudioPresetSeedService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcileCatalog();
    } catch (error) {
      this.logger.error(
        'Studio system preset seed failed',
        error instanceof Error ? error : new Error(String(error)),
        'StudioPresetSeedService',
      );
    }
  }

  /**
   * Seed each built-in template on its own: one failed write (for example a
   * platform-key conflict) must not leave the remaining templates unseeded.
   */
  async reconcileCatalog(): Promise<number> {
    let count = 0;
    for (const preset of STUDIO_SYSTEM_PRESETS) {
      try {
        if (await this.seedPreset(preset)) count += 1;
      } catch (error) {
        this.logger.error(
          `Studio system preset seed failed for ${preset.key}`,
          error instanceof Error ? error : new Error(String(error)),
          'StudioPresetSeedService',
        );
      }
    }
    return count;
  }

  /** Returns false when a tenant row owns the reserved ID. */
  private async seedPreset(
    preset: (typeof STUDIO_SYSTEM_PRESETS)[number],
  ): Promise<boolean> {
    const id = studioSystemPresetId(preset.key);
    // tenant-scope-ignore: reserved platform seed ID collision probe; tenant rows are never rewritten, including deleted rows.
    const existing = await this.prisma.preset.findUnique({
      where: { id },
      select: { organizationId: true, brandId: true },
    });
    // Deterministic IDs own only platform rows; never rewrite a tenant fork.
    if (
      existing &&
      (existing.organizationId !== null || existing.brandId !== null)
    )
      return false;
    const category =
      preset.type === 'image' ? ModelCategory.IMAGE : ModelCategory.VIDEO;
    const config = {
      key: preset.key,
      label: preset.label,
      description: preset.description,
      prompt: preset.prompt,
      ...preset.values,
    };
    // tenant-scope-ignore: platform seed owns only null organization/brand rows and preserves operator soft deletion on boot.
    await this.prisma.preset.upsert({
      where: { id, organizationId: null, brandId: null },
      create: {
        id,
        organizationId: null,
        brandId: null,
        category,
        config,
        isActive: true,
      },
      // Seed missing rows only. Admin edits, activation and deletion own
      // the persisted record after its first creation.
      update: {},
    });
    return true;
  }
}
