import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type ArticlesSeedResult,
  seedArticles,
} from '@api-scripts/seeds/articles.seed';
import {
  seedWorkflows,
  type WorkflowsSeedResult,
} from '@api-scripts/seeds/workflows.seed';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { SeedArticlesDto } from './dto/seed-articles.dto';
import type { SeedWorkflowsDto } from './dto/seed-workflows.dto';

/** Tags on the public article endpoints, dropped after a live article seed. */
const PUBLIC_ARTICLE_CACHE_TAGS = ['articles', 'public'];

export interface ArticlesSeedSummary {
  brandId: string;
  created: number;
  dryRun: boolean;
  organizationId: string;
  refreshed: number;
}

export type WorkflowsSeedSummary = WorkflowsSeedResult;

@Injectable()
export class AdminSeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async seedArticles(dto: SeedArticlesDto): Promise<ArticlesSeedSummary> {
    const dryRun = dto.dryRun !== false;

    if (!dryRun) {
      if (!dto.organizationId && !dto.ownerEmail) {
        throw new BadRequestException(
          'A live article seed must name its owner: pass ownerEmail or organizationId',
        );
      }
      if (!dto.brandId && !dto.brandSlug) {
        throw new BadRequestException(
          'A live article seed must name its review brand: pass brandId or brandSlug',
        );
      }
    }

    const result: ArticlesSeedResult = await this.run(() =>
      seedArticles(
        this.prisma,
        {
          brandId: dto.brandId,
          brandSlug: dto.brandSlug,
          dryRun,
          environmentLabel: 'admin api',
          organizationId: dto.organizationId,
          organizationLabel: dto.organizationLabel,
          ownerEmail: dto.ownerEmail,
        },
        {
          invalidateCache: async () => {
            await this.cache.invalidateByTags(PUBLIC_ARTICLE_CACHE_TAGS);
          },
        },
      ),
    );

    return {
      brandId: result.owner.brandId,
      created: result.created,
      dryRun: result.dryRun,
      organizationId: result.owner.organizationId,
      refreshed: result.refreshed,
    };
  }

  async seedWorkflows(dto: SeedWorkflowsDto): Promise<WorkflowsSeedSummary> {
    const dryRun = dto.dryRun !== false;

    if (!dryRun && !dto.brandId && !dto.organizationId && !dto.allBrands) {
      throw new BadRequestException(
        'A live workflow seed must name brandId or organizationId, or pass allBrands',
      );
    }

    return this.run(() =>
      seedWorkflows(this.prisma, {
        brandId: dto.brandId,
        dryRun,
        environmentLabel: 'admin api',
        organizationId: dto.organizationId,
      }),
    );
  }

  /** The seeds throw plain errors for bad input (unknown owner, bad id). */
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Seed failed',
      );
    }
  }
}
