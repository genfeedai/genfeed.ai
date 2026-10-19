import { createHash } from 'node:crypto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { FONT_FAMILY_METADATA } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type FontFamilySeedResult = {
  failed: string[];
  unchanged: number;
  written: number;
};

export function fontFamilyId(key: string): string {
  return `c${createHash('md5').update(`font_families:${key}`).digest('hex').slice(0, 24)}`;
}

/**
 * Platform font families, one row per shipped TTF. Insert-if-missing like the
 * studio elements: a superadmin's rename, edit or delete is never overwritten.
 */
@Injectable()
export class FontFamilySeedService {
  private readonly context = 'FontFamilySeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async reconcileCatalog(
    catalog = Object.values(FONT_FAMILY_METADATA),
  ): Promise<FontFamilySeedResult> {
    const result: FontFamilySeedResult = {
      failed: [],
      unchanged: 0,
      written: 0,
    };

    for (const entry of catalog) {
      try {
        if (await this.seedEntry(entry)) {
          result.written += 1;
        } else {
          result.unchanged += 1;
        }
      } catch (error) {
        result.failed.push(`font_families:${entry.key}`);
        this.logger.error(
          `Font family seed failed for ${entry.key}`,
          error instanceof Error ? error : new Error(String(error)),
          this.context,
        );
      }
    }

    if (result.failed.length > 0) {
      throw new Error(
        `Font family reconcile failed for: ${result.failed.join(', ')}`,
      );
    }

    this.logger.log(
      `Font families reconciled (written=${result.written}, unchanged=${result.unchanged})`,
      this.context,
    );
    return result;
  }

  private async seedEntry(entry: {
    description: string;
    key: string;
    label: string;
  }): Promise<boolean> {
    const id = fontFamilyId(entry.key);
    // tenant-scope-ignore: platform seed probes deterministic ids and platform keys
    const existing = await this.prisma.fontFamilyRecord.findFirst({
      select: { id: true },
      where: { OR: [{ id }, { key: entry.key, organizationId: null }] },
    });
    if (existing) return false;

    // tenant-scope-ignore: first insert of a platform catalog row
    await this.prisma.fontFamilyRecord.create({
      data: {
        description: entry.description,
        id,
        isDeleted: false,
        key: entry.key,
        label: entry.label,
        organizationId: null,
      },
    });
    return true;
  }
}
