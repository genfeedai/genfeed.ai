import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  CreditTransactionCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  isLongGeneration,
  isPurchasedCredit,
} from './email-product-signals.policy';
import {
  buildEmailSignalWorkflows,
  EMAIL_SIGNAL_ACTIONS,
  EMAIL_SIGNAL_WORKFLOWS,
} from './email-product-signals.workflow';

const PAGE_SIZE = 100;
const DAY_MS = 86_400_000;
/**
 * The tenant schedule fans out every five minutes because generation results
 * and delivery recovery are latency-sensitive. Sweeps that only need to be
 * eventually correct run on the first tick of each hour instead, so they cost
 * one pass per organization per hour rather than twelve.
 */
function isHourlySweepTick(now: Date): boolean {
  return now.getUTCMinutes() < 5;
}

@Injectable()
export class EmailProductSignalsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailPerformanceService,
    private readonly config: ConfigService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly queue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(EMAIL_SIGNAL_ACTIONS.DISPATCH, () =>
      this.dispatch(),
    );
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
    for (const definition of buildEmailSignalWorkflows())
      this.runner.registerWorkflow(definition);
  }

  async dispatch(): Promise<{ count: number }> {
    if (isSelfHostedDeployment()) return { count: 0 };
    let cursor: string | undefined;
    let count = 0;
    const bucket = Math.floor(Date.now() / 300_000);
    while (true) {
      // tenant-scope-ignore: system discovery only enumerates active organization IDs; all work runs in scoped child workflows.
      const organizations = await this.prisma.organization.findMany({
        where: { isDeleted: false },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const organization of organizations) {
        if (!organization.userId) continue;
        await this.queue.queueSystemWorkflow(
          {
            canonicalId: EMAIL_SIGNAL_WORKFLOWS.ORGANIZATION,
            actionType: EMAIL_SIGNAL_WORKFLOWS.ORGANIZATION,
            organizationId: organization.id,
            userId: organization.userId,
            source: 'email-product-signals',
            inputValues: {},
          },
          `email-signals-${organization.id}-${bucket}`,
          { attempts: 3, replaceTerminalJob: true },
        );
        count++;
      }
      if (organizations.length < PAGE_SIZE) break;
      cursor = organizations.at(-1)?.id;
    }
    return { count };
  }

  async generations(organizationId: string): Promise<{ count: number }> {
    if (isSelfHostedDeployment()) return { count: 0 };
    const now = new Date();
    const since = await this.checkpoint(organizationId, 'generation', now);
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
          brand: { select: { slug: true } },
          organization: { select: { slug: true } },
        },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
        const destinationUrl = `${this.appUrl()}/${encodeURIComponent(asset.organization.slug)}/${encodeURIComponent(asset.brand.slug)}/library/assets?asset=${encodeURIComponent(asset.id)}`;
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
            bodyHtml: buildSystemEmailParagraph(
              isFailed
                ? 'This generation could not finish. Open the asset to review it and try again.'
                : 'Your generation has finished. Open the asset to review it and prepare it for publishing.',
            ),
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
    await this.advanceCheckpoint(organizationId, 'generation', now);
    return { count };
  }

  async conversions(organizationId: string): Promise<{ count: number }> {
    if (isSelfHostedDeployment()) return { count: 0 };
    const now = new Date();
    // Attribution reads a seven-day window; it does not need five-minute latency.
    if (!isHourlySweepTick(now)) return { count: 0 };
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
          acceptedAt: { gte: new Date(since.getTime() - 7 * DAY_MS), lte: now },
        },
        select: { id: true, userId: true, goal: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
            where: {
              ...scope,
              ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
              publishedAt: range,
            },
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
    const since = await this.checkpoint(organizationId, 'receipt', now);
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
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
          destinationUrl: `${this.appUrl()}/${encodeURIComponent(organization.slug ?? organizationId)}/~/settings/subscription`,
          idempotencyKey: `purchase-${purchase.id}`,
          policyData: { transactionId: purchase.id },
          html: buildSystemEmailHtml({
            title: 'Your credits are available',
            bodyHtml: buildSystemEmailParagraph(
              `${purchase.amount.toLocaleString('en-US')} credits have been added to your workspace. You can continue creating.`,
            ),
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
    await this.advanceCheckpoint(organizationId, 'receipt', now);
    return { count };
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
    return checkpoint?.scannedThrough ?? new Date(now.getTime() - DAY_MS);
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
    ).replace(/\/$/, '');
  }
}
