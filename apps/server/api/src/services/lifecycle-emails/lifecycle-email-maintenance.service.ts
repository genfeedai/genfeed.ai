import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  CreditTransactionCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types';
import { getLifecycleSystemEmailDefinition } from '@genfeedai/contracts/constants';
import { BillingAccountMemberRole, Prisma } from '@genfeedai/prisma';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  LIFECYCLE_MAINTENANCE_IDS,
  type LifecycleMaintenanceRequest,
  lifecycleMaintenanceWorkflows,
} from './lifecycle-email-maintenance-workflow';
import { LifecycleEmailWorkflowService } from './lifecycle-email-workflow.service';
import {
  GENERATED_CONTENT_FILTER,
  SystemEmailEligibilityService,
} from './system-email-eligibility.service';

const DAY_MS = 86_400_000;
/**
 * A balance that simply sits below the threshold is not news. Only an
 * escalation (low then exhausted) breaks the cooldown; repeating the same tier
 * waits a week.
 */
const CREDIT_ALERT_COOLDOWN_MS = 7 * DAY_MS;
const CREDIT_ALERT_TEMPLATE_KEYS = ['credit-low', 'credit-exhausted'] as const;
export function completedEmailPeriod(
  reference: Date,
  weekly: boolean,
): { start: Date; end: Date } {
  const end = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ),
  );
  if (weekly) end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7));
  return { end, start: new Date(end.getTime() - (weekly ? 7 : 1) * DAY_MS) };
}

@Injectable()
export class LifecycleEmailMaintenanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly workflow: LifecycleEmailWorkflowService,
    private readonly emails: EmailPerformanceService,
    private readonly eligibility: SystemEmailEligibilityService,
    private readonly preferences: NotificationPreferenceService,
    private readonly queue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      LIFECYCLE_MAINTENANCE_IDS.DISCOVER,
      ({ input }) => this.discover(input.request as { referenceDate: string }),
    );
    for (const [id, operation] of [
      [LIFECYCLE_MAINTENANCE_IDS.RECOVER, this.recover.bind(this)],
      [LIFECYCLE_MAINTENANCE_IDS.RECAP, this.recaps.bind(this)],
      [LIFECYCLE_MAINTENANCE_IDS.CREDITS, this.credits.bind(this)],
    ] as const) {
      this.runner.registerAction(id, async ({ context, input }) => {
        const request = input.request as LifecycleMaintenanceRequest;
        if (context.organizationId !== request.organizationId)
          throw new Error('Email maintenance tenant mismatch');
        if (!isSelfHostedDeployment()) await operation(request);
        return request;
      });
    }
    for (const definition of lifecycleMaintenanceWorkflows())
      this.runner.registerWorkflow(definition);
  }

  private async discover(request: {
    referenceDate: string;
  }): Promise<{ count: number }> {
    if (isSelfHostedDeployment()) return { count: 0 };
    let cursor: string | undefined;
    let count = 0;
    while (true) {
      // tenant-scope-ignore: administrative discovery reads tenant identifiers only; each queued child supplies its canonical organization scope.
      const organizations = await this.prisma.organization.findMany({
        where: { isDeleted: false },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
        take: 100,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
      });
      for (const organization of organizations) {
        await this.queue.queueSystemWorkflow(
          {
            actionType: LIFECYCLE_MAINTENANCE_IDS.ORGANIZATION,
            canonicalId: LIFECYCLE_MAINTENANCE_IDS.ORGANIZATION,
            organizationId: organization.id,
            userId: organization.userId,
            source: 'system-email-tenant-schedule',
            inputValues: {
              request: {
                organizationId: organization.id,
                referenceDate: request.referenceDate,
              },
            },
          },
          `system-email-${organization.id}-${Math.floor(new Date(request.referenceDate).getTime() / 300_000)}`,
          { attempts: 3, replaceTerminalJob: true },
        );
        count++;
      }
      if (organizations.length < 100) return { count };
      cursor = organizations[organizations.length - 1].id;
    }
  }

  async recover(request: LifecycleMaintenanceRequest): Promise<void> {
    let cursor: string | undefined;
    while (true) {
      const due = await this.prisma.lifecycleEmailDelivery.findMany({
        where: {
          status: { in: ['scheduled', 'failed'] },
          scheduledFor: { lte: new Date(request.referenceDate) },
          OR: [
            {
              metadata: {
                path: ['organizationId'],
                equals: request.organizationId,
              },
            },
            {
              metadata: { path: ['organizationId'], equals: Prisma.AnyNull },
              user: {
                is: {
                  members: {
                    some: {
                      organizationId: request.organizationId,
                      isDeleted: false,
                      isActive: true,
                    },
                  },
                },
              },
            },
          ],
        },
        orderBy: { id: 'asc' },
        take: 100,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
      });
      for (const row of due) {
        const metadata =
          row.metadata &&
          typeof row.metadata === 'object' &&
          !Array.isArray(row.metadata)
            ? row.metadata
            : {};
        if (!metadata.organizationId) {
          // tenant-scope-ignore: resolves the recipient's canonical (oldest) organization so exactly one tenant claims an org-less delivery; the row is discarded below unless it is this organization, and nothing is mutated before that check.
          const membership = await this.prisma.member.findFirst({
            where: { userId: row.userId, isDeleted: false, isActive: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { organizationId: true },
          });
          if (membership?.organizationId !== request.organizationId) continue;
          await this.prisma.lifecycleEmailDelivery.update({
            where: { id: row.id },
            data: {
              metadata: { ...metadata, organizationId: request.organizationId },
            },
          });
        }
        const definition = getLifecycleSystemEmailDefinition(row.step);
        if (!definition) continue;
        await this.workflow.scheduleEmail(
          {
            organizationId: request.organizationId,
            userId: row.userId,
            sequence: definition.sequence,
            step: definition.step,
            triggerKey: row.triggerKey,
          },
          row.scheduledFor,
        );
      }
      if (due.length < 100) return;
      cursor = due[due.length - 1].id;
    }
  }

  async recaps(request: LifecycleMaintenanceRequest): Promise<void> {
    const now = new Date(request.referenceDate);
    if (now.getUTCMinutes() >= 5) return;
    const organization = await this.prisma.organization.findFirst({
      where: { id: request.organizationId, isDeleted: false },
      select: { slug: true },
    });
    if (!organization) return;
    let cursor: string | undefined;
    while (true) {
      const members = await this.prisma.member.findMany({
        where: {
          organizationId: request.organizationId,
          isDeleted: false,
          isActive: true,
        },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
        take: 100,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
      });
      for (const member of members) {
        const weeklyQueued = await this.sendRecap(
          request,
          member.userId,
          organization.slug,
          true,
        );
        if (!weeklyQueued || now.getUTCDay() !== 1)
          await this.sendRecap(
            request,
            member.userId,
            organization.slug,
            false,
          );
        if (!weeklyQueued || now.getUTCDay() !== 1)
          await this.connectionReminder(
            request,
            member.userId,
            organization.slug,
          );
      }
      if (members.length < 100) return;
      cursor = members[members.length - 1].id;
    }
  }

  private async sendRecap(
    request: LifecycleMaintenanceRequest,
    userId: string,
    organizationSlug: string,
    weekly: boolean,
  ): Promise<boolean> {
    const preference = await this.preferences.findForUser(
      userId,
      weekly ? 'content.weekly' : 'content.daily',
    );
    if (!preference.isEnabled) return false;
    const { start, end } = completedEmailPeriod(
      new Date(request.referenceDate),
      weekly,
    );
    const scope = {
      organizationId: request.organizationId,
      isDeleted: false,
      userId,
    };
    const [ingredients, articles] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: {
          ...GENERATED_CONTENT_FILTER,
          ...scope,
          generationCompletedAt: { gte: start, lt: end },
        },
        select: { id: true, brandId: true, category: true },
      }),
      this.prisma.article.findMany({
        where: { ...scope, generationCompletedAt: { gte: start, lt: end } },
        select: { id: true, brandId: true, label: true },
      }),
    ]);
    const generated = new Set([
      ...ingredients.map((item) => `ingredient:${item.id}`),
      ...articles.map((item) => `article:${item.id}`),
    ]).size;
    if (generated < (weekly ? 5 : 1)) return false;
    const { published, publishedIds } = await this.resolvePublishedOutputs(
      request.organizationId,
      scope,
      ingredients.map(({ id }) => id),
      articles.map(({ id }) => id),
    );
    const credits = await this.prisma.creditTransaction.aggregate({
      where: {
        organizationId: request.organizationId,
        isDeleted: false,
        actorUserId: userId,
        category: CreditTransactionCategory.DEDUCT,
        createdAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    });
    const metrics = published.length
      ? await this.prisma.contentPerformance.findMany({
          where: {
            organizationId: request.organizationId,
            isDeleted: false,
            postId: { in: published.map(({ id }) => id) },
            measuredAt: { not: null },
          },
          select: {
            postId: true,
            views: true,
            likes: true,
            comments: true,
            shares: true,
          },
          distinct: ['postId'],
          orderBy: { measuredAt: 'desc' },
        })
      : [];
    const { destinationUrl, missingConnection } =
      await this.resolveRecapDestination(
        request.organizationId,
        organizationSlug,
        [...ingredients, ...articles].map(({ brandId }) => brandId),
      );
    const views = metrics.some((row) => row.views !== null)
      ? metrics
          .reduce((sum, row) => sum + (row.views ?? 0), 0)
          .toLocaleString('en-US')
      : 'unavailable';
    const interactions = metrics.some(
      (row) =>
        row.likes !== null || row.comments !== null || row.shares !== null,
    )
      ? metrics
          .reduce(
            (sum, row) =>
              sum + (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0),
            0,
          )
          .toLocaleString('en-US')
      : 'unavailable';
    const periodLabel = weekly ? 'week' : 'day';
    const paragraphs = [
      `Your ${periodLabel} in Genfeed: ${start.toISOString().slice(0, 10)} to ${new Date(end.getTime() - 1).toISOString().slice(0, 10)} (UTC).`,
      `You generated ${generated} pieces of content. ${publishedIds.size} have been published and ${generated - publishedIds.size} are ready to review or publish.`,
      ...(articles.length
        ? [
            `Recent articles: ${articles
              .slice(0, 3)
              .map((article) => article.label)
              .join('; ')}.`,
          ]
        : []),
      `${Math.abs(credits._sum.amount ?? 0).toLocaleString('en-US')} credits used during this period.`,
      ...(metrics.length
        ? [
            `Latest measured performance for these published pieces: views ${views}; interactions ${interactions}.`,
          ]
        : ['Published performance will appear when analytics are available.']),
      ...(missingConnection
        ? [
            'Some of your content has no connected publishing account. Connect a destination to share what you created.',
          ]
        : []),
    ];
    await this.queueProductEmail({
      request,
      userId,
      topic: weekly ? 'content.weekly' : 'content.daily',
      templateKey: weekly ? 'content-weekly' : 'content-daily',
      key: `${weekly ? 'week' : 'day'}:${userId}:${start.toISOString()}`,
      subject: `Your Genfeed ${periodLabel}: ${generated} pieces created`,
      paragraphs,
      destinationUrl,
      actionLabel: missingConnection
        ? 'Connect and publish'
        : 'Review your content',
      goal: missingConnection ? 'connect_account' : 'publish_content',
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    });
    return true;
  }

  /**
   * Which of the period's outputs already reached a published post. A post can
   * reference an output directly or through its ingredient join, so both are
   * folded into one set of `kind:id` keys.
   */
  private async resolvePublishedOutputs(
    organizationId: string,
    scope: Record<string, unknown>,
    ingredientIds: string[],
    articleIds: string[],
  ): Promise<{ published: Array<{ id: string }>; publishedIds: Set<string> }> {
    const ownedIngredients = {
      id: { in: ingredientIds },
      organizationId,
      isDeleted: false,
    };
    const published = await this.prisma.post.findMany({
      where: scopedWhere(organizationId, {
        ...scope,
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        OR: [
          { entityIngredientId: { in: ingredientIds } },
          { entityArticleId: { in: articleIds } },
          { ingredients: { some: ownedIngredients } },
        ],
      }),
      select: {
        id: true,
        entityIngredientId: true,
        entityArticleId: true,
        ingredients: { where: ownedIngredients, select: { id: true } },
      },
    });
    const publishedIds = new Set<string>();
    for (const post of published) {
      if (
        post.entityIngredientId &&
        ingredientIds.includes(post.entityIngredientId)
      )
        publishedIds.add(`ingredient:${post.entityIngredientId}`);
      if (post.entityArticleId && articleIds.includes(post.entityArticleId))
        publishedIds.add(`article:${post.entityArticleId}`);
      for (const item of post.ingredients)
        publishedIds.add(`ingredient:${item.id}`);
    }
    return { published, publishedIds };
  }

  /**
   * Points the recap at the brand that needs attention: the first one without a
   * publishing connection, otherwise any brand that produced content.
   */
  private async resolveRecapDestination(
    organizationId: string,
    organizationSlug: string,
    brandIds: Array<string | null>,
  ): Promise<{ destinationUrl: string; missingConnection: boolean }> {
    const brands = new Set(brandIds.filter((id): id is string => !!id));
    let missingConnection = false;
    let destinationBrandId: string | undefined;
    for (const brandId of brands)
      if (!(await this.eligibility.hasConnection(organizationId, brandId))) {
        missingConnection = true;
        destinationBrandId ??= brandId;
      }
    const destinationBrand = await this.prisma.brand.findFirst({
      where: {
        organizationId,
        isDeleted: false,
        id: destinationBrandId ?? [...brands][0],
      },
      select: { slug: true },
    });
    const organizationPath = encodeURIComponent(organizationSlug);
    return {
      destinationUrl: destinationBrand
        ? `${this.appUrl()}/${organizationPath}/${encodeURIComponent(destinationBrand.slug)}/${missingConnection ? 'settings/integrations' : 'studio/generate'}`
        : `${this.appUrl()}/${organizationPath}`,
      missingConnection,
    };
  }

  private async connectionReminder(
    request: LifecycleMaintenanceRequest,
    userId: string,
    organizationSlug: string,
  ): Promise<void> {
    if (
      !(await this.preferences.findForUser(userId, 'publishing.connection'))
        .isEnabled
    )
      return;
    const now = new Date(request.referenceDate);
    const ingredients = await this.prisma.ingredient.findMany({
      where: scopedWhere(request.organizationId, {
        ...GENERATED_CONTENT_FILTER,
        userId,
        generationCompletedAt: {
          gte: new Date(now.getTime() - 7 * DAY_MS),
          lt: new Date(now.getTime() - DAY_MS),
        },
        brandId: { not: null },
      }),
      select: { brandId: true },
      distinct: ['brandId'],
    });
    const articles = await this.prisma.article.findMany({
      where: {
        organizationId: request.organizationId,
        isDeleted: false,
        userId,
        brandId: { not: null },
        generationCompletedAt: {
          gte: new Date(now.getTime() - 7 * DAY_MS),
          lt: new Date(now.getTime() - DAY_MS),
        },
      },
      select: { brandId: true },
      distinct: ['brandId'],
    });
    const items = [
      ...new Map(
        [...ingredients, ...articles].map((item) => [item.brandId, item]),
      ).values(),
    ];
    for (const item of items) {
      if (
        !item.brandId ||
        (await this.eligibility.hasConnection(
          request.organizationId,
          item.brandId,
        ))
      )
        continue;
      const brand = await this.prisma.brand.findFirst({
        where: {
          id: item.brandId,
          organizationId: request.organizationId,
          isDeleted: false,
        },
        select: { slug: true, label: true },
      });
      if (!brand) continue;
      const period = completedEmailPeriod(now, true).end.toISOString();
      await this.queueProductEmail({
        request,
        userId,
        topic: 'publishing.connection',
        templateKey: 'publishing-connection',
        key: `connection:${userId}:${item.brandId}:${period}`,
        subject: `Your ${brand.label} content is ready to publish`,
        paragraphs: [
          'You have generated content waiting for a publishing destination.',
          'Connect an account to review and publish it from Genfeed.',
        ],
        destinationUrl: `${this.appUrl()}/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(brand.slug)}/settings/integrations`,
        actionLabel: 'Connect an account',
        goal: 'connect_account',
        brandId: item.brandId,
      });
    }
  }

  async credits(request: LifecycleMaintenanceRequest): Promise<void> {
    // A balance alert has a multi-day cooldown; evaluating it hourly is enough,
    // and the tenant schedule otherwise re-reads every organization's balance
    // twelve times an hour.
    if (new Date(request.referenceDate).getUTCMinutes() >= 5) return;
    const [balance, organization] = await Promise.all([
      this.prisma.creditBalance.findFirst({
        where: { organizationId: request.organizationId, isDeleted: false },
        select: { balance: true, heldAmount: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: request.organizationId, isDeleted: false },
        select: {
          userId: true,
          slug: true,
          billingAccount: {
            select: {
              members: {
                where: {
                  isDeleted: false,
                  role: BillingAccountMemberRole.OWNER,
                },
                select: { userId: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
    ]);
    if (!balance || !organization) return;
    const spendable = balance.balance - balance.heldAmount;
    if (spendable >= 1000) return;
    const exhausted = spendable <= 0;
    const recipientId =
      organization.billingAccount?.members[0]?.userId ?? organization.userId;
    // One lookup across both tiers: a separate per-template window let a
    // balance dipping to zero send both emails the same day.
    const recentAlert = await this.prisma.emailMessage.findFirst({
      where: {
        organizationId: request.organizationId,
        isDeleted: false,
        userId: recipientId,
        templateKey: { in: [...CREDIT_ALERT_TEMPLATE_KEYS] },
        createdAt: {
          gt: new Date(
            new Date(request.referenceDate).getTime() -
              CREDIT_ALERT_COOLDOWN_MS,
          ),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { templateKey: true },
    });
    const hasEscalated = exhausted && recentAlert?.templateKey === 'credit-low';
    if (recentAlert && !hasEscalated) return;
    await this.queueProductEmail({
      request,
      userId: recipientId,
      topic: 'billing.credits',
      templateKey: exhausted ? 'credit-exhausted' : 'credit-low',
      key: `credits:${exhausted ? 'empty' : 'low'}:${new Date(request.referenceDate).toISOString().slice(0, 10)}`,
      // The cooldown above owns repeat suppression; this key only guards
      // against the same tick running twice.
      subject: exhausted
        ? 'Your Genfeed credits are used up'
        : 'Your Genfeed credits are running low',
      paragraphs: [
        `You have ${Math.max(0, spendable).toLocaleString('en-US')} credits available after current generation reservations.`,
        'Add credits to keep creating content.',
      ],
      destinationUrl: `${this.appUrl()}/${encodeURIComponent(organization.slug)}/~/settings/credits`,
      actionLabel: 'Add credits',
      goal: 'buy_credits',
    });
  }

  private async queueProductEmail(input: {
    request: LifecycleMaintenanceRequest;
    userId: string;
    topic: string;
    templateKey: string;
    key: string;
    subject: string;
    paragraphs: string[];
    destinationUrl: string;
    actionLabel: string;
    goal: 'connect_account' | 'publish_content' | 'buy_credits';
    brandId?: string;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<void> {
    const html = buildSystemEmailHtml({
      appUrl: this.appUrl(),
      title: input.subject,
      preheader: input.paragraphs[0],
      bodyHtml: input.paragraphs
        .map((paragraph) => buildSystemEmailParagraph(paragraph))
        .join(''),
      action: { label: input.actionLabel, url: input.destinationUrl },
      footerNote:
        'Manage these emails in your Genfeed notification preferences.',
    }).replaceAll(
      `href="${escapeSystemEmailHtml(input.destinationUrl)}"`,
      'href="{{emailActionUrl}}"',
    );
    await this.emails.queueEmail({
      organizationId: input.request.organizationId,
      userId: input.userId,
      topic: input.topic,
      templateKey: input.templateKey,
      idempotencyKey: `product:${input.request.organizationId}:${input.key}`,
      subject: input.subject,
      html,
      destinationUrl: input.destinationUrl,
      goal: input.goal,
      policyData: {
        ...(input.brandId ? { brandId: input.brandId } : {}),
        ...(input.periodStart ? { periodStart: input.periodStart } : {}),
        ...(input.periodEnd ? { periodEnd: input.periodEnd } : {}),
      },
    });
  }

  private appUrl(): string {
    return (
      this.config.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai'
    ).replace(/\/+$/, '');
  }
}
