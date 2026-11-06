import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  CreditTransactionCategory,
  IngredientCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createLibraryAssetRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import {
  buildCreditPurchaseEmailBody,
  buildGenerationEmailBody,
  buildSystemEmailHtml,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  isLongGeneration,
  isPurchasedCredit,
} from './email-product-signals.policy';
import {
  EMAIL_CONVERSION_ACCEPTED_LOOKBACK_MS,
  EMAIL_SIGNAL_ACTIONS,
  EMAIL_SIGNAL_DEFAULT_LOOKBACK_MS,
  EMAIL_SIGNAL_STREAMS,
} from './email-product-signals.workflow';

const TRAILING_SLASH_PATTERN = /\/$/;

function generationKind(category: string): 'image' | 'video' | 'audio' {
  if (category === IngredientCategory.IMAGE) return 'image';
  if (category === IngredientCategory.VIDEO) return 'video';
  return 'audio';
}

const PAGE_SIZE = 100;
const DAY_MS = 86_400_000;
@Traced()
@Injectable()
export class EmailProductSignalsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailPerformanceService,
    private readonly config: ConfigService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      EMAIL_SIGNAL_ACTIONS.GENERATIONS,
      ({ context }) => this.generations(context.organizationId),
    );
    this.runner.registerAction(
      EMAIL_SIGNAL_ACTIONS.CONVERSIONS,
      ({ context }) => this.conversions(context.organizationId),
    );
    this.runner.registerAction(EMAIL_SIGNAL_ACTIONS.RECEIPTS, ({ context }) =>
      this.receipts(context.organizationId),
    );
  }

  async generations(organizationId: string): Promise<{ count: number }> {
    if (isSelfHostedDeployment()) return { count: 0 };
    const now = new Date();
    const since = await this.checkpoint(
      organizationId,
      EMAIL_SIGNAL_STREAMS.GENERATION,
      now,
    );
    let cursor: string | undefined;
    let count = 0;
    while (true) {
      const assets = await this.prisma.ingredient.findMany({
        where: {
          organizationId,
          isDeleted: false,
          parentId: null,
          generationCompletedAt: { gte: since, lte: now },
          status: { in: ['GENERATED', 'FAILED'] },
        },
        select: {
          id: true,
          category: true,
          status: true,
          userId: true,
          generationStartedAt: true,
          generationCompletedAt: true,
          brand: { select: { slug: true, label: true } },
          organization: { select: { slug: true } },
        },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
      });
      for (const asset of assets) {
        if (
          !asset.userId ||
          !asset.brand?.slug ||
          !asset.organization?.slug ||
          !isLongGeneration(
            asset.generationStartedAt,
            asset.generationCompletedAt,
          )
        )
          continue;
        const isFailed = asset.status === 'FAILED';
        const subject = isFailed
          ? 'Your generation needs attention'
          : 'Your content is ready';
        const destinationUrl = `${this.appUrl()}${createBrandAppRoute(encodeURIComponent(asset.organization.slug), encodeURIComponent(asset.brand.slug), createLibraryAssetRoute(asset.category, asset.id))}`;
        await this.emails.queueEmail({
          organizationId,
          userId: asset.userId,
          topic: 'generation.status',
          templateKey: isFailed ? 'generation-failed' : 'generation-ready',
          subject,
          destinationUrl,
          idempotencyKey: `generation-${asset.id}-${asset.status}-${asset.generationCompletedAt?.toISOString()}`,
          policyData: {
            assetId: asset.id,
            completedAt: asset.generationCompletedAt?.toISOString() ?? '',
            status: asset.status,
          },
          html: buildSystemEmailHtml({
            title: subject,
            bodyHtml: buildGenerationEmailBody({
              brandLabel: asset.brand.label,
              imageUrl: this.generationPreviewUrl(asset),
              isFailed,
              kind: generationKind(asset.category),
            }),
            action: {
              label: isFailed ? 'Review generation' : 'View content',
              url: `${this.appUrl()}/__email_action__`,
            },
          }).replaceAll(
            `${this.appUrl()}/__email_action__`,
            '{{emailActionUrl}}',
          ),
        });
        count++;
      }
      if (assets.length < PAGE_SIZE) break;
      cursor = assets.at(-1)?.id;
    }
    await this.advanceCheckpoint(
      organizationId,
      EMAIL_SIGNAL_STREAMS.GENERATION,
      now,
    );
    return { count };
  }

  async conversions(organizationId: string): Promise<{ count: number }> {
    if (isSelfHostedDeployment()) return { count: 0 };
    const now = new Date();
    const since = new Date(now.getTime() - 7 * DAY_MS);
    let cursor: string | undefined;
    let count = 0;
    while (true) {
      // Read accepted-message cohorts; the attribution service checks immutable CTA click history against each action time.
      const messages = await this.prisma.emailMessage.findMany({
        where: {
          organizationId,
          isDeleted: false,
          goal: { not: null },
          acceptedAt: {
            gte: new Date(
              now.getTime() - EMAIL_CONVERSION_ACCEPTED_LOOKBACK_MS,
            ),
            lte: now,
          },
        },
        select: { id: true, userId: true, goal: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
      });
      const users = new Map(
        messages.map((message) => [
          `${message.userId}/${message.goal}`,
          message,
        ]),
      );
      for (const message of users.values()) {
        const scope = {
          organizationId,
          isDeleted: false,
          userId: message.userId,
        };
        const range = { gte: since, lte: now };
        if (message.goal === 'generate_content') {
          const [assets, articles] = await Promise.all([
            this.prisma.ingredient.findMany({
              where: {
                ...scope,
                parentId: null,
                status: 'GENERATED',
                generationCompletedAt: range,
              },
              select: { id: true, generationCompletedAt: true },
            }),
            this.prisma.article.findMany({
              where: { ...scope, generationCompletedAt: range },
              select: { id: true, generationCompletedAt: true },
            }),
          ]);
          for (const asset of assets)
            if (asset.generationCompletedAt)
              count += await this.attribute(
                organizationId,
                message.userId,
                message.goal,
                `ingredient/${asset.id}`,
                asset.generationCompletedAt,
              );
          for (const article of articles)
            if (article.generationCompletedAt)
              count += await this.attribute(
                organizationId,
                message.userId,
                message.goal,
                `article/${article.id}`,
                article.generationCompletedAt,
              );
        } else if (message.goal === 'connect_account') {
          const credentials = await this.prisma.credential.findMany({
            where: { ...scope, isConnected: true, connectedAt: range },
            select: { id: true, connectedAt: true },
          });
          for (const credential of credentials)
            if (credential.connectedAt)
              count += await this.attribute(
                organizationId,
                message.userId,
                message.goal,
                `credential/${credential.id}`,
                credential.connectedAt,
              );
        } else if (message.goal === 'publish_content') {
          const posts = await this.prisma.post.findMany({
            where: scopedWhere(organizationId, {
              ...scope,
              ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
              publishedAt: range,
            }),
            select: { id: true, publishedAt: true },
          });
          for (const post of posts)
            if (post.publishedAt)
              count += await this.attribute(
                organizationId,
                message.userId,
                message.goal,
                `post/${post.id}`,
                post.publishedAt,
              );
        } else if (message.goal === 'buy_credits') {
          const credits = await this.prisma.creditTransaction.findMany({
            where: {
              organizationId,
              isDeleted: false,
              actorUserId: message.userId,
              category: CreditTransactionCategory.ADD,
              amount: { gt: 0 },
              createdAt: range,
            },
            select: {
              id: true,
              createdAt: true,
              referenceType: true,
              referenceId: true,
            },
          });
          for (const credit of credits)
            if (isPurchasedCredit(credit))
              count += await this.attribute(
                organizationId,
                message.userId,
                message.goal,
                `credit/${credit.id}`,
                credit.createdAt,
              );
        }
      }
      if (messages.length < PAGE_SIZE) break;
      cursor = messages.at(-1)?.id;
    }
    return { count };
  }

  async receipts(organizationId: string): Promise<{ count: number }> {
    if (isSelfHostedDeployment()) return { count: 0 };
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { slug: true, userId: true },
    });
    if (!organization) return { count: 0 };
    const now = new Date();
    const since = await this.checkpoint(
      organizationId,
      EMAIL_SIGNAL_STREAMS.RECEIPT,
      now,
    );
    let cursor: string | undefined;
    let count = 0;
    while (true) {
      const purchases = await this.prisma.creditTransaction.findMany({
        where: {
          organizationId,
          isDeleted: false,
          category: CreditTransactionCategory.ADD,
          amount: { gt: 0 },
          createdAt: { gte: since, lt: now },
          referenceType: { startsWith: 'stripe-checkout-session:' },
        },
        select: {
          id: true,
          actorUserId: true,
          amount: true,
          referenceId: true,
          referenceType: true,
        },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
      });
      for (const purchase of purchases) {
        const userId = purchase.actorUserId ?? organization.userId;
        if (!userId || !isPurchasedCredit(purchase)) continue;
        await this.emails.queueEmail({
          organizationId,
          userId,
          topic: 'billing.receipt',
          templateKey: 'credit-purchase-confirmation',
          subject: 'Your Genfeed credits are available',
          destinationUrl: `${this.appUrl()}${createOrganizationAppRoute(encodeURIComponent(organization.slug ?? organizationId), APP_ROUTES.SETTINGS.SUBSCRIPTION)}`,
          idempotencyKey: `purchase-${purchase.id}`,
          policyData: { transactionId: purchase.id },
          html: buildSystemEmailHtml({
            title: 'Your credits are available',
            bodyHtml: buildCreditPurchaseEmailBody({
              amount: purchase.amount,
            }),
            action: {
              label: 'Open your workspace',
              url: `${this.appUrl()}/__email_action__`,
            },
          }).replaceAll(
            `${this.appUrl()}/__email_action__`,
            '{{emailActionUrl}}',
          ),
        });
        count++;
      }
      if (purchases.length < PAGE_SIZE) break;
      cursor = purchases.at(-1)?.id;
    }
    await this.advanceCheckpoint(
      organizationId,
      EMAIL_SIGNAL_STREAMS.RECEIPT,
      now,
    );
    return { count };
  }

  /** Public CDN still for an image or video; audio and others have none. */
  private generationPreviewUrl(asset: {
    id: string;
    category: string;
  }): string | null {
    const endpoint = this.config.ingredientsEndpoint;
    if (!endpoint) return null;
    if (asset.category === IngredientCategory.IMAGE)
      return `${endpoint}/images/${asset.id}`;
    if (asset.category === IngredientCategory.VIDEO)
      return `${endpoint}/thumbnails/${asset.id}`;
    return null;
  }

  private async checkpoint(
    organizationId: string,
    stream: string,
    now: Date,
  ): Promise<Date> {
    const checkpoint = await this.prisma.emailSignalCheckpoint.findFirst({
      where: { organizationId, stream, isDeleted: false },
      select: { scannedThrough: true },
    });
    return (
      checkpoint?.scannedThrough ??
      new Date(now.getTime() - EMAIL_SIGNAL_DEFAULT_LOOKBACK_MS)
    );
  }

  private async advanceCheckpoint(
    organizationId: string,
    stream: string,
    scannedThrough: Date,
  ): Promise<void> {
    // tenant-scope-ignore: compound checkpoint identity explicitly includes organization.
    await this.prisma.emailSignalCheckpoint.upsert({
      where: { organizationId_stream: { organizationId, stream } },
      create: { organizationId, stream, scannedThrough },
      update: {},
    });
    await this.prisma.emailSignalCheckpoint.updateMany({
      where: {
        organizationId,
        stream,
        isDeleted: false,
        scannedThrough: { lt: scannedThrough },
      },
      data: { scannedThrough },
    });
  }

  private async attribute(
    organizationId: string,
    userId: string,
    goal: string,
    sourceId: string,
    occurredAt: Date,
  ): Promise<number> {
    return (await this.emails.recordConversion({
      organizationId,
      userId,
      goal,
      sourceId,
      occurredAt,
    }))
      ? 1
      : 0;
  }

  private appUrl(): string {
    return (
      this.config.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai'
    ).replace(TRAILING_SLASH_PATTERN, '');
  }
}
