import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { STORYBOARD_RUN_CONTRACT } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { parseStoryboardRunId } from '@genfeedai/contracts/api-types/contracts/storyboard-still.contract';
import type { IStoryboardNotificationContext } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

interface StoryboardMediaIds {
  groupId?: string | null;
  organizationId?: string | null;
  sourceActionId?: string | null;
}

/**
 * A storyboard still or video is posted into its storyboard's Discord thread,
 * not the studio channel. The run must be a storyboard (other remix runs share
 * the key shape). The title and layout link are best effort: a lookup failure
 * leaves the generation on the ordinary channel path.
 */
@Injectable()
export class StoryboardNotificationContextService {
  private readonly constructorName = StoryboardNotificationContextService.name;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  async find(
    ingredient: StoryboardMediaIds,
  ): Promise<IStoryboardNotificationContext | null> {
    const runId =
      parseStoryboardRunId(ingredient.sourceActionId) ??
      parseStoryboardRunId(ingredient.groupId);
    const organizationId = ingredient.organizationId;
    if (!runId || !organizationId) return null;
    try {
      const run = await this.prisma.contentRun.findFirst({
        select: {
          brand: { select: { slug: true } },
          config: true,
          organization: { select: { slug: true } },
        },
        where: scopedWhere(organizationId, {
          config: { equals: STORYBOARD_RUN_CONTRACT, path: ['contract'] },
          id: runId,
        }),
      });
      if (!run) return null;
      const config: unknown = run.config;
      const plan: unknown =
        config && typeof config === 'object'
          ? Reflect.get(config, 'plan')
          : null;
      const planTitle: unknown =
        plan && typeof plan === 'object' ? Reflect.get(plan, 'title') : null;
      const title =
        typeof planTitle === 'string' && planTitle.trim()
          ? planTitle.trim()
          : 'Untitled storyboard';
      const orgSlug = run.organization?.slug;
      const brandSlug = run.brand?.slug;
      return {
        layoutPath:
          orgSlug && brandSlug
            ? `/${encodeURIComponent(orgSlug)}/${encodeURIComponent(brandSlug)}/storyboard/${encodeURIComponent(runId)}`
            : undefined,
        runId,
        title,
      };
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} storyboard lookup failed (non-fatal)`,
        { error: getErrorMessage(error), runId },
      );
      return null;
    }
  }
}
