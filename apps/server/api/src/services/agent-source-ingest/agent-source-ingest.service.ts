import { createHash } from 'node:crypto';
import {
  AgentSourceDownloadService,
  AgentSourceImportPendingError,
} from '@api/services/agent-source-ingest/agent-source-download.service';
import type {
  AgentSourceIngestContext,
  AgentSourceIngestInput,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  Prisma,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AgentSourceIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly downloader: AgentSourceDownloadService,
  ) {}

  async ingest(
    input: AgentSourceIngestInput,
    context: AgentSourceIngestContext,
  ): Promise<{ ingredientId: string }> {
    await this.assertThreadScope(context);
    if (Boolean(input.url?.trim()) === Boolean(input.ingredientId?.trim()))
      throw new BadRequestException(
        'Select exactly one source URL or Library ingredient.',
      );
    const scope = {
      organizationId: context.organizationId,
      brandId: context.brandId ?? null,
      isDeleted: false,
    };
    if (input.ingredientId) {
      return this.useExistingSource(input.ingredientId, input.kind, context);
    }
    const url = await this.downloader.normalizeUrl(input.url?.trim() ?? '');
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          organizationId: context.organizationId,
          brandId: context.brandId ?? null,
          userId: context.userId,
          threadId: context.threadId,
          url,
          kind: input.kind ?? null,
        }),
      )
      .digest('hex');
    const ingredientId = `c${digest.slice(0, 48)}`;
    const where = { ...scope, id: ingredientId };
    const existing = await this.prisma.ingredient.findFirst({
      where,
      select: { id: true, status: true, generationStage: true },
    });
    if (existing?.status === IngredientStatus.UPLOADED) return { ingredientId };
    const pendingJobId =
      existing?.status === IngredientStatus.PROCESSING &&
      existing.generationStage?.startsWith('source-job:')
        ? existing.generationStage.slice('source-job:'.length)
        : undefined;
    if (existing && !pendingJobId) {
      const claim = await this.prisma.ingredient.updateMany({
        where: {
          id: ingredientId,
          organizationId: context.organizationId,
          brandId: context.brandId ?? null,
          isDeleted: false,
          status: IngredientStatus.FAILED,
        },
        data: {
          status: IngredientStatus.PROCESSING,
          generationError: null,
          generationStage: null,
        },
      });
      if (claim.count !== 1)
        throw new ConflictException(
          'This source import is already in progress. Reopen it instead of creating another import.',
        );
    } else if (!existing) {
      await this.createSourceIngredient(input, context, ingredientId, digest);
    }
    try {
      const artifact = await this.downloader.download(
        url,
        ingredientId,
        input.kind,
        context,
        pendingJobId,
        async (jobId) => {
          const persisted = await this.prisma.ingredient.updateMany({
            where: {
              id: ingredientId,
              organizationId: context.organizationId,
              brandId: context.brandId ?? null,
              isDeleted: false,
              status: IngredientStatus.PROCESSING,
            },
            data: { generationStage: `source-job:${jobId}` },
          });
          if (persisted.count !== 1)
            throw new ConflictException(
              'Source import scope changed before extraction.',
            );
        },
      );
      await this.assertThreadScope(context);
      await this.prisma.ingredient.update({
        where,
        data: {
          status: IngredientStatus.UPLOADED,
          category: this.category(artifact.kind),
          s3Key: artifact.storageKey,
          cdnUrl: artifact.publicUrl,
          fileSize: Math.round(artifact.size),
          generationError: null,
          metadata: {
            update: {
              extension: artifact.extension,
              width: Math.round(artifact.width),
              height: Math.round(artifact.height),
              duration: artifact.duration,
              size: Math.round(artifact.size),
              hasAudio: artifact.hasAudio,
            },
          },
        },
      });
      return { ingredientId };
    } catch (error) {
      if (error instanceof AgentSourceImportPendingError) throw error;
      await this.prisma.ingredient.updateMany({
        where: {
          id: ingredientId,
          organizationId: context.organizationId,
          brandId: context.brandId ?? null,
          isDeleted: false,
          status: IngredientStatus.PROCESSING,
        },
        data: {
          status: IngredientStatus.FAILED,
          generationError:
            'Source import failed. Retry this source from the same thread.',
        },
      });
      throw error;
    }
  }

  private async createSourceIngredient(
    input: AgentSourceIngestInput,
    context: AgentSourceIngestContext,
    ingredientId: string,
    digest: string,
  ): Promise<void> {
    try {
      await this.prisma.ingredient.create({
        data: {
          id: ingredientId,
          organization: { connect: { id: context.organizationId } },
          ...(context.brandId
            ? { brand: { connect: { id: context.brandId } } }
            : {}),
          user: { connect: { id: context.userId } },
          isDeleted: false,
          category: this.category(input.kind ?? 'video'),
          status: IngredientStatus.PROCESSING,
          sourceActionId: `agent-source:${digest}`,
          metadata: {
            create: {
              label: input.title?.trim().slice(0, 200) || 'Imported source',
              extension: MetadataExtension.MP4,
              isDeleted: false,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'This source import already exists. Reopen it before retrying.',
        );
      throw error;
    }
  }

  private async useExistingSource(
    ingredientId: string,
    kind: AgentSourceIngestInput['kind'],
    context: AgentSourceIngestContext,
  ): Promise<{ ingredientId: string }> {
    const scope = {
      organizationId: context.organizationId,
      brandId: context.brandId ?? null,
      isDeleted: false,
    };
    const source = await this.prisma.ingredient.findFirst({
      where: {
        ...scope,
        id: ingredientId,
        status: {
          in: [
            IngredientStatus.UPLOADED,
            IngredientStatus.GENERATED,
            IngredientStatus.VALIDATED,
          ],
        },
      },
      select: { id: true, category: true, cdnUrl: true, s3Key: true },
    });
    const categories =
      kind === 'audio'
        ? [
            IngredientCategory.AUDIO,
            IngredientCategory.VOICE,
            IngredientCategory.MUSIC,
          ]
        : kind
          ? [this.category(kind)]
          : [
              IngredientCategory.IMAGE,
              IngredientCategory.VIDEO,
              IngredientCategory.AUDIO,
              IngredientCategory.VOICE,
              IngredientCategory.MUSIC,
            ];
    if (
      !source ||
      !categories.includes(source.category) ||
      (!source.cdnUrl && !source.s3Key)
    )
      throw new ForbiddenException(
        'Source is not available in the active Library scope.',
      );
    return { ingredientId: source.id };
  }

  private category(
    kind: NonNullable<AgentSourceIngestInput['kind']>,
  ): IngredientCategory {
    return kind === 'image'
      ? IngredientCategory.IMAGE
      : kind === 'audio'
        ? IngredientCategory.AUDIO
        : IngredientCategory.VIDEO;
  }

  private async assertThreadScope(
    context: AgentSourceIngestContext,
  ): Promise<void> {
    const thread = await this.prisma.agentThread.findFirst({
      where: {
        id: context.threadId,
        organizationId: context.organizationId,
        userId: context.userId,
        brandId: context.brandId ?? null,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!thread)
      throw new ForbiddenException(
        'The active thread scope is no longer available.',
      );
  }
}
