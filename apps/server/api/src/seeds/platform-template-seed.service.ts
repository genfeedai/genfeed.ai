import {
  PLATFORM_TEMPLATES,
  type PlatformTemplateDefinition,
} from '@api/seeds/platform-template-catalog';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Scope } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type PlatformTemplateSeedResult = {
  /** Keys a live run would create (dry run) or did create. */
  keys: string[];
  unchanged: number;
  written: number;
};

/**
 * Platform (system) templates: `organizationId: null`, `purpose: 'prompt'`.
 * Insert-if-missing only: a row an operator edited, deactivated or deleted is
 * never rewritten, so the seed is safe to run on every deploy and by hand.
 */
@Injectable()
export class PlatformTemplateSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async reconcileCatalog(
    options: { isDryRun?: boolean } = {},
  ): Promise<PlatformTemplateSeedResult> {
    const result: PlatformTemplateSeedResult = {
      keys: [],
      unchanged: 0,
      written: 0,
    };
    const failedKeys: string[] = [];

    for (const template of PLATFORM_TEMPLATES) {
      try {
        if (await this.seedTemplate(template, options.isDryRun === true)) {
          result.written += 1;
          result.keys.push(template.key);
        } else {
          result.unchanged += 1;
        }
      } catch (error) {
        failedKeys.push(template.key);
        this.logger.error(
          `Platform template seed failed for ${template.key}`,
          error instanceof Error ? error : new Error(String(error)),
          'PlatformTemplateSeedService',
        );
      }
    }

    if (failedKeys.length > 0) {
      throw new Error(
        `Platform template reconcile failed for: ${failedKeys.join(', ')}`,
      );
    }
    return result;
  }

  private async seedTemplate(
    template: PlatformTemplateDefinition,
    isDryRun: boolean,
  ): Promise<boolean> {
    // tenant-scope-ignore: platform seed probes only the null-organization row for its key, including deleted rows so an operator delete sticks.
    const existing = await this.prisma.template.findFirst({
      select: { id: true },
      where: {
        key: template.key,
        organizationId: null,
        purpose: 'prompt',
      },
    });
    if (existing) return false;
    if (isDryRun) return true;

    // tenant-scope-ignore: platform seed owns only null-organization rows
    await this.prisma.template.create({
      data: {
        category: template.category,
        config: {
          content: template.content,
          description: template.description,
          tags: template.tags,
        },
        isActive: true,
        isDeleted: false,
        key: template.key,
        label: template.label,
        metadata: {
          create: {
            author: 'Genfeed',
            compatiblePlatforms: [],
            data: {},
            version: '1.0.0',
          },
        },
        organizationId: null,
        purpose: 'prompt',
        scope: Scope.PUBLIC,
        variables: template.variables,
        version: 1,
      },
    });
    return true;
  }
}
