import { createHash } from 'node:crypto';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import type {
  TimelineCollectedPost,
  TimelineScope,
} from '@api/services/social-timeline/social-timeline.types';
import {
  classifyTimelineError,
  SocialTimelineProviderService,
  timelineCapability,
} from '@api/services/social-timeline/social-timeline-provider.service';
import {
  buildSocialTimelineActionWorkflow,
  SOCIAL_TIMELINE_ACTION_ID,
  SOCIAL_TIMELINE_WORKFLOW_ID,
} from '@api/services/social-timeline/social-timeline-workflow-definition';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ConnectedTimelineSyncStatus,
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  SocialSourceType,
  SourcePostNativeActionStatus,
  toPrismaCredentialPlatform,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type {
  ISourcePost,
  SocialTimelineResponse,
  SourcePostNativeActionInput,
  SourcePostNativeActionResult,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

@Injectable()
export class SocialTimelineService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: SocialTimelineProviderService,
    private readonly workflows: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflows.registerWorkflow(buildSocialTimelineActionWorkflow());
    this.workflows.registerAction(SOCIAL_TIMELINE_ACTION_ID, (request) =>
      this.runNativeAction(request),
    );
  }

  private runNativeAction(
    request: SystemWorkflowActionRequest,
  ): Promise<SourcePostNativeActionResult> {
    const input = readRecord(request.input.request);
    const required = (key: string): string => {
      const value = input[key];
      if (typeof value !== 'string' || !value)
        throw new BadRequestException(`Missing ${key}.`);
      return value;
    };
    if (
      required('organizationId') !== request.context.organizationId ||
      required('userId') !== request.context.userId
    )
      throw new BadRequestException(
        'The action scope does not match this workflow.',
      );
    const action = (
      ['like', 'reply', 'repost', 'quote', 'comment'] as const
    ).find((value) => value === input.action);
    if (!action) throw new BadRequestException('Invalid native action.');
    return this.actNative(
      {
        organizationId: request.context.organizationId,
        userId: request.context.userId,
        brandId: required('brandId'),
      },
      required('postId'),
      {
        action,
        credentialId: required('credentialId'),
        idempotencyKey: required('idempotencyKey'),
        text: typeof input.text === 'string' ? input.text : undefined,
      },
    );
  }

  async read(scope: TimelineScope): Promise<SocialTimelineResponse> {
    const credentials = await this.prisma.credential.findMany({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
      }),
      orderBy: { createdAt: 'asc' },
    });
    const sources = await this.prisma.socialSource.findMany({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        sourceType: SocialSourceType.TIMELINE,
        isActive: true,
      }),
      include: {
        posts: {
          where: scopedWhere(scope.organizationId, { brandId: scope.brandId }),
          orderBy: { publishedAt: 'desc' },
          take: 100,
        },
      },
    });
    return {
      accounts: credentials.flatMap((credential) => {
        const platform = fromPrismaCredentialPlatform(credential.platform);
        // Research and generation credentials are not social feed connections.
        if (
          !platform ||
          ![
            'twitter',
            'youtube',
            'instagram',
            'tiktok',
            'linkedin',
            'facebook',
            'threads',
            'reddit',
            'pinterest',
            'bluesky',
            'mastodon',
          ].includes(platform)
        )
          return [];
        const source = sources.find(
          (item) => item.credentialId === credential.id,
        );
        const capability = timelineCapability(
          platform,
          credential.grantedScopesCapturedAt
            ? credential.grantedScopes
            : undefined,
        );
        const status =
          capability.kind === 'unsupported'
            ? 'unsupported'
            : (source?.lastSyncStatus ??
              ConnectedTimelineSyncStatus.NOT_SYNCED);
        return [
          {
            ...capability,
            credentialId: credential.id,
            platform,
            label:
              credential.externalName ||
              credential.externalHandle ||
              credential.label ||
              platform,
            avatarUrl: credential.externalAvatar,
            sourceId: source?.id,
            status: credential.isConnected
              ? this.readStatus(status)
              : 'reconnect',
            message: !credential.isConnected
              ? 'Reconnect this account to restore access.'
              : source?.lastSyncError || capability.message,
            lastSyncedAt: source?.lastSyncedAt?.toISOString() ?? null,
            posts:
              source?.posts.map(
                (post): ISourcePost => ({
                  ...post,
                  metrics: post.metrics as ISourcePost['metrics'],
                  raw: readRecord(post.raw),
                  publishedAt: post.publishedAt?.toISOString() ?? null,
                  collectedAt: post.collectedAt.toISOString(),
                  createdAt: post.createdAt.toISOString(),
                  updatedAt: post.updatedAt.toISOString(),
                }),
              ) ?? [],
          },
        ];
      }),
    };
  }

  private readStatus(
    value: string,
  ): SocialTimelineResponse['accounts'][number]['status'] {
    const statuses: SocialTimelineResponse['accounts'][number]['status'][] = [
      'refreshing',
      'ready',
      'empty',
      'not_synced',
      'unsupported',
      'reconnect',
      'access_required',
      'budget_blocked',
      'rate_limited',
      'failed',
    ];
    return statuses.find((status) => status === value) ?? 'failed';
  }

  async refresh(
    scope: TimelineScope,
    credentialId?: string,
  ): Promise<SocialTimelineResponse> {
    const credentials = await this.prisma.credential.findMany({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        isConnected: true,
        ...(credentialId
          ? { id: credentialId }
          : {
              platform: {
                in: [
                  toPrismaCredentialPlatform(CredentialPlatform.TWITTER),
                  toPrismaCredentialPlatform(CredentialPlatform.YOUTUBE),
                ].filter(
                  (value): value is NonNullable<typeof value> =>
                    value !== undefined,
                ),
              },
            }),
      }),
      take: 20,
    });
    if (credentialId && !credentials.length)
      throw new NotFoundException({ message: 'Connected account not found.' });
    for (const credential of credentials) {
      const platform = fromPrismaCredentialPlatform(credential.platform);
      if (!platform || timelineCapability(platform).kind === 'unsupported')
        continue;
      const handle = `timeline:${credential.id}`;
      const existing = await this.prisma.socialSource.findFirst({
        where: scopedWhere(scope.organizationId, {
          brandId: scope.brandId,
          credentialId: credential.id,
          sourceType: SocialSourceType.TIMELINE,
        }),
      });
      let source = existing;
      if (!source) {
        try {
          source = await this.prisma.socialSource.create({
            data: {
              ...scope,
              credentialId: credential.id,
              platform,
              sourceType: SocialSourceType.TIMELINE,
              handle,
              displayName: credential.externalName || credential.externalHandle,
              metadata: { provenance: 'native-following' },
            },
          });
        } catch (error: unknown) {
          if (readRecord(error).code !== 'P2002') throw error;
          source = await this.prisma.socialSource.findFirst({
            where: scopedWhere(scope.organizationId, {
              brandId: scope.brandId,
              credentialId: credential.id,
              sourceType: SocialSourceType.TIMELINE,
            }),
          });
          if (!source) throw error;
        }
      }
      const resolvedSource = source;
      // Reserve a single refresh per account; concurrent refreshes return saved data.
      const claimed = await this.prisma.socialSource.updateMany({
        where: scopedWhere(scope.organizationId, {
          id: resolvedSource.id,
          brandId: scope.brandId,
          OR: [
            { lastSyncStatus: null },
            { lastSyncStatus: { not: ConnectedTimelineSyncStatus.REFRESHING } },
            { updatedAt: { lt: new Date(Date.now() - 10 * 60000) } },
          ],
        }),
        data: { lastSyncStatus: ConnectedTimelineSyncStatus.REFRESHING },
      });
      if (!claimed.count) continue;
      try {
        const posts = await this.provider.collect(
          scope,
          credential.id,
          platform,
        );
        await this.saveSnapshot(scope, resolvedSource.id, credential.id, posts);
      } catch (error: unknown) {
        const failure = classifyTimelineError(error);
        await this.prisma.socialSource.updateMany({
          where: scopedWhere(scope.organizationId, {
            brandId: scope.brandId,
            id: resolvedSource.id,
          }),
          data: {
            lastSyncStatus: failure.status,
            lastSyncError: failure.message,
          },
        });
      }
    }
    return this.read(scope);
  }

  private async saveSnapshot(
    scope: TimelineScope,
    sourceId: string,
    credentialId: string,
    posts: TimelineCollectedPost[],
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        for (const post of posts) {
          const data = {
            ...post,
            userId: scope.userId,
            publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
            collectedAt: new Date(),
            metrics: (post.metrics ?? {}) as Prisma.InputJsonValue,
            raw: {
              provenance: 'native-following',
              credentialId: credentialId,
            },
          };
          // tenant-scope-ignore: source is resolved and reserved within the selected tenant; unique identity reactivates its own tombstone.
          await tx.sourcePost.upsert({
            where: {
              sourceId_externalId: {
                sourceId: sourceId,
                externalId: post.externalId,
              },
            },
            create: {
              ...data,
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              sourceId: sourceId,
            },
            update: { ...data, isDeleted: false },
          });
        }
        await tx.sourcePost.updateMany({
          where: scopedWhere(scope.organizationId, {
            brandId: scope.brandId,
            sourceId: sourceId,
            externalId: { notIn: posts.map((post) => post.externalId) },
          }),
          data: { isDeleted: true },
        });
        await tx.socialSource.updateMany({
          where: scopedWhere(scope.organizationId, {
            brandId: scope.brandId,
            id: sourceId,
          }),
          data: {
            lastSyncedAt: new Date(),
            lastSyncStatus: posts.length
              ? ConnectedTimelineSyncStatus.READY
              : ConnectedTimelineSyncStatus.EMPTY,
            lastSyncError: null,
          },
        });
      },
      { timeout: 30000 },
    );
  }

  async act(
    scope: TimelineScope,
    postId: string,
    input: SourcePostNativeActionInput,
  ): Promise<SourcePostNativeActionResult> {
    const { result } =
      await this.workflows.runWorkflow<SourcePostNativeActionResult>({
        canonicalId: SOCIAL_TIMELINE_WORKFLOW_ID,
        actionType: SOCIAL_TIMELINE_WORKFLOW_ID,
        organizationId: scope.organizationId,
        userId: scope.userId,
        source: 'SocialTimelineService.act',
        trigger: WorkflowExecutionTrigger.API,
        inputValues: {
          request: {
            ...scope,
            postId,
            action: input.action,
            credentialId: input.credentialId,
            idempotencyKey: input.idempotencyKey,
            ...(input.text !== undefined ? { text: input.text } : {}),
          },
        },
      });
    return result;
  }

  private async actNative(
    scope: TimelineScope,
    postId: string,
    input: SourcePostNativeActionInput,
  ): Promise<SourcePostNativeActionResult> {
    const text = input.text?.trim();
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          postId,
          credentialId: input.credentialId,
          action: input.action,
          text: text ?? null,
        }),
      )
      .digest('hex');
    const saved = await this.prisma.sourcePostNativeAction.findFirst({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        idempotencyKey: input.idempotencyKey,
      }),
    });
    if (saved) {
      if (saved.requestHash !== requestHash)
        throw new ConflictException(
          'This action key was already used for another request.',
        );
      return {
        id: saved.id,
        status:
          saved.status === SourcePostNativeActionStatus.COMPLETED
            ? 'completed'
            : saved.status === SourcePostNativeActionStatus.UNCERTAIN
              ? 'uncertain'
              : 'pending',
        externalId: saved.externalId,
        message: saved.message,
      };
    }
    const post = await this.prisma.sourcePost.findFirst({
      where: scopedWhere(scope.organizationId, {
        id: postId,
        brandId: scope.brandId,
      }),
    });
    if (!post) throw new NotFoundException({ message: 'Post not found.' });
    if (!timelineCapability(post.platform).actions.includes(input.action))
      throw new BadRequestException(
        'This platform does not support this action.',
      );
    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id: input.credentialId,
        platform: toPrismaCredentialPlatform(post.platform),
        isConnected: true,
      }),
    });
    if (!credential)
      throw new NotFoundException({
        message: 'Connected account not found for this post.',
      });
    if (
      !timelineCapability(
        post.platform,
        credential.grantedScopesCapturedAt
          ? credential.grantedScopes
          : undefined,
      ).actions.includes(input.action)
    )
      throw new BadRequestException(
        'Reconnect this account with permission for this action.',
      );
    if (['reply', 'quote', 'comment'].includes(input.action) && !text)
      throw new BadRequestException('Enter the text to publish.');
    let receipt: Awaited<
      ReturnType<PrismaService['sourcePostNativeAction']['create']>
    >;
    try {
      receipt = await this.prisma.sourcePostNativeAction.create({
        data: {
          ...scope,
          postId,
          credentialId: input.credentialId,
          action: input.action,
          requestHash,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (error: unknown) {
      if (readRecord(error).code !== 'P2002') throw error;
      const existing = await this.prisma.sourcePostNativeAction.findFirst({
        where: scopedWhere(scope.organizationId, {
          brandId: scope.brandId,
          idempotencyKey: input.idempotencyKey,
        }),
      });
      if (!existing || existing.requestHash !== requestHash)
        throw new ConflictException(
          'This action key was already used for another request.',
        );
      return {
        id: existing.id,
        status:
          existing.status === SourcePostNativeActionStatus.COMPLETED
            ? 'completed'
            : existing.status === SourcePostNativeActionStatus.UNCERTAIN
              ? 'uncertain'
              : 'pending',
        externalId: existing.externalId,
        message: existing.message,
      };
    }
    try {
      const externalId = await this.provider.execute(
        scope,
        credential.id,
        post.platform,
        { action: input.action, text, externalId: post.externalId },
      );
      await this.prisma.sourcePostNativeAction.updateMany({
        where: scopedWhere(scope.organizationId, {
          brandId: scope.brandId,
          id: receipt.id,
        }),
        data: { status: SourcePostNativeActionStatus.COMPLETED, externalId },
      });
      return {
        id: receipt.id,
        status: SourcePostNativeActionStatus.COMPLETED,
        externalId,
      };
    } catch (error: unknown) {
      const failure = classifyTimelineError(error);
      const message = `${failure.message} Delivery could not be confirmed. Check the source before sending again.`;
      await this.prisma.sourcePostNativeAction.updateMany({
        where: scopedWhere(scope.organizationId, {
          brandId: scope.brandId,
          id: receipt.id,
        }),
        data: { status: SourcePostNativeActionStatus.UNCERTAIN, message },
      });
      return {
        id: receipt.id,
        status: SourcePostNativeActionStatus.UNCERTAIN,
        message,
      };
    }
  }
}
