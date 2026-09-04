/**
 * Seed a repeatable local dataset for visual and interaction QA.
 *
 * Dry-run is the default. Pass `--live` to apply changes. Live runs refuse
 * non-local database hosts and update the same QA rows instead of duplicating
 * them.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/local-debug-data.seed.ts
 *   bun run apps/server/api/scripts/seeds/local-debug-data.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/local-debug-data.seed.ts --organizationSlug=default --live
 */

import { resolve } from 'node:path';
import process from 'node:process';
import { CampaignStatus, CampaignTargetStatus } from '@genfeedai/contracts';
import {
  CredentialPlatform,
  PostCategory,
  PrismaClient,
} from '@genfeedai/prisma';
import { createPrismaPgConfig } from '@libs/prisma/prisma-pg-config';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

const QA_PREFIX = '[QA Seed]';
const DEFAULT_ORGANIZATION_SLUG = 'default';
const LOCAL_DATABASE_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
  'localhost',
]);

type SeedArgs = {
  dryRun: boolean;
  organizationSlug: string;
};

type SeedBrand = {
  credentials: Array<{
    id: string;
    platform: CredentialPlatform;
  }>;
  id: string;
  label: string;
};

type PostFixture = {
  category: PostCategory;
  description: string;
  label: string;
  platform: string;
  status: string;
};

const POST_FIXTURES: PostFixture[] = [
  {
    category: PostCategory.IMAGE,
    description:
      'A practical launch checklist for teams building a repeatable content system.',
    label: 'Launch checklist carousel',
    platform: 'instagram',
    status: 'public',
  },
  {
    category: PostCategory.VIDEO,
    description:
      'A short product walkthrough showing how one brief becomes a campaign.',
    label: 'Product workflow walkthrough',
    platform: 'youtube',
    status: 'public',
  },
  {
    category: PostCategory.TEXT,
    description:
      'Three lessons learned while turning brand context into durable infrastructure.',
    label: 'Founder lessons thread',
    platform: 'twitter',
    status: 'draft',
  },
  {
    category: PostCategory.REEL,
    description:
      'A scheduled behind-the-scenes look at the weekly content planning ritual.',
    label: 'Planning ritual reel',
    platform: 'instagram',
    status: 'scheduled',
  },
  {
    category: PostCategory.POST,
    description:
      'A processing post used to verify loading, progress, and action states.',
    label: 'Processing campaign update',
    platform: 'twitter',
    status: 'processing',
  },
  {
    category: PostCategory.VIDEO,
    description:
      'A failed video publish used to verify recovery actions and error copy.',
    label: 'Failed customer story video',
    platform: 'tiktok',
    status: 'failed',
  },
];

const TASK_FIXTURES = [
  ['QA-101', 'Review the September launch brief', 'backlog', 'high'],
  ['QA-102', 'Draft the product education carousel', 'todo', 'medium'],
  ['QA-103', 'Generate three campaign thumbnails', 'in_progress', 'critical'],
  ['QA-104', 'Approve the customer story edit', 'in_review', 'high'],
  ['QA-105', 'Resolve the missing source footage', 'blocked', 'medium'],
  ['QA-106', 'Publish the weekly content report', 'done', 'low'],
] as const;

const TREND_FIXTURES = [
  ['instagram', 'Behind-the-scenes workflows', 87, 12400, 31],
  ['tiktok', 'Founder-led product demos', 79, 8600, 24],
  ['youtube', 'AI workflow breakdowns', 72, 5900, 18],
  ['twitter', 'Content operations systems', 64, 3200, 12],
] as const;

function parseArgs(argv: string[]): SeedArgs {
  return {
    dryRun: !argv.includes('--live'),
    organizationSlug:
      argv
        .find((arg) => arg.startsWith('--organizationSlug='))
        ?.slice('--organizationSlug='.length) || DEFAULT_ORGANIZATION_SLUG,
  };
}

function loadLocalEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/server/api/.env.local'),
    resolve(process.cwd(), 'apps/server/api/.env'),
  ];

  for (const path of candidates) {
    config({ override: false, path, quiet: true });
  }
}

function getDatabaseUrl(): URL {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Local debug data requires a PostgreSQL DATABASE_URL');
  }

  return url;
}

function assertLocalDatabase(url: URL): void {
  const isLocal =
    LOCAL_DATABASE_HOSTS.has(url.hostname) ||
    url.hostname.endsWith('.localhost');
  if (!isLocal) {
    throw new Error(
      `Refusing to seed a non-local database host: ${url.hostname || 'unknown'}`,
    );
  }
}

function createPrismaClient(url: URL): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(createPrismaPgConfig(url.toString())),
  });
}

function dayAtMidnight(daysAgo: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function dateFromNow(days: number, hours = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(date.getHours() + hours);
  return date;
}

function platformEnum(platform: string): CredentialPlatform {
  const platforms: Record<string, CredentialPlatform> = {
    instagram: CredentialPlatform.INSTAGRAM,
    tiktok: CredentialPlatform.TIKTOK,
    twitter: CredentialPlatform.TWITTER,
    youtube: CredentialPlatform.YOUTUBE,
  };
  const value = platforms[platform];
  if (!value) {
    throw new Error(`Unsupported QA analytics platform: ${platform}`);
  }
  return value;
}

async function seedPublishing(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  brands: SeedBrand[],
): Promise<void> {
  for (const [brandIndex, brand] of brands.entries()) {
    const campaignKey = `qa-debug-campaign-${brand.id}`;
    const campaign = await prisma.campaign.upsert({
      create: {
        brandId: brand.id,
        brief: 'Demonstrate a complete campaign with mixed publishing states.',
        endDate: dateFromNow(14),
        idempotencyKey: campaignKey,
        name: `${QA_PREFIX} ${brand.label} launch`,
        objective:
          'Exercise campaign, release, post, and analytics interfaces.',
        organizationId,
        startDate: dateFromNow(-14),
        status: brandIndex === 0 ? 'active' : 'completed',
        userId,
      },
      update: {
        brief: 'Demonstrate a complete campaign with mixed publishing states.',
        isDeleted: false,
        objective:
          'Exercise campaign, release, post, and analytics interfaces.',
        status: brandIndex === 0 ? 'active' : 'completed',
      },
      where: {
        organizationId_idempotencyKey: {
          idempotencyKey: campaignKey,
          organizationId,
        },
      },
    });

    for (const [fixtureIndex, fixture] of POST_FIXTURES.entries()) {
      const credential =
        brand.credentials[fixtureIndex % brand.credentials.length];
      if (!credential) {
        throw new Error(
          `Brand has no usable local credential target: ${brand.label}`,
        );
      }
      const fixturePlatform = credential.platform.toLowerCase();
      const fixtureKey =
        fixture.status === 'public' && fixtureIndex > 0
          ? `${fixture.status}-${fixtureIndex}`
          : fixture.status;
      const key = `qa-debug-${brand.id}-${fixtureKey}`;
      const scheduledAt =
        fixture.status === 'scheduled' ? dateFromNow(3, fixtureIndex) : null;
      const publishedAt =
        fixture.status === 'public' ? dateFromNow(-fixtureIndex - 1) : null;
      const targetExecutionState =
        fixture.status === 'public'
          ? 'published'
          : fixture.status === 'failed'
            ? 'failed'
            : fixture.status;

      const group = await prisma.postGroup.upsert({
        create: {
          baseContent: fixture.description,
          brandId: brand.id,
          campaignId: campaign.id,
          idempotencyKey: key,
          organizationId,
          ownerId: userId,
          publishedAt,
          scheduledAt,
          status: fixture.status,
          statusTransitions: [
            { at: dateFromNow(-7), from: null, to: 'draft' },
            { at: dateFromNow(-1), from: 'draft', to: fixture.status },
          ],
          title: `${QA_PREFIX} ${fixture.label}`,
        },
        update: {
          baseContent: fixture.description,
          campaignId: campaign.id,
          isDeleted: false,
          publishedAt,
          scheduledAt,
          status: fixture.status,
          title: `${QA_PREFIX} ${fixture.label}`,
        },
        where: {
          organizationId_idempotencyKey: {
            idempotencyKey: key,
            organizationId,
          },
        },
      });

      const post = await prisma.post.upsert({
        create: {
          analyticsCollectedAt: publishedAt,
          analyticsCollectionState:
            fixture.status === 'public' ? 'available' : 'unavailable',
          brandId: brand.id,
          campaignId: campaign.id,
          category: fixture.category,
          credentialId: credential.id,
          description: fixture.description,
          externalId:
            fixture.status === 'public'
              ? `qa-${brandIndex}-${fixtureIndex}`
              : null,
          groupId: group.id,
          label: `${QA_PREFIX} ${fixture.label}`,
          organizationId,
          platform: fixturePlatform,
          publicationDate: publishedAt,
          publishedAt,
          scheduledDate: scheduledAt,
          source: 'qa-debug-seed',
          status: fixture.status,
          targetError:
            fixture.status === 'failed'
              ? {
                  code: 'QA_PROVIDER_REJECTED',
                  message: 'Synthetic QA failure',
                }
              : undefined,
          targetExecutionState,
          targetIdempotencyKey: key,
          targetValidationState: 'valid',
          userId,
          visibility: fixture.status === 'public' ? 'public' : null,
        },
        update: {
          analyticsCollectedAt: publishedAt,
          analyticsCollectionState:
            fixture.status === 'public' ? 'available' : 'unavailable',
          campaignId: campaign.id,
          credentialId: credential.id,
          description: fixture.description,
          groupId: group.id,
          isDeleted: false,
          label: `${QA_PREFIX} ${fixture.label}`,
          platform: fixturePlatform,
          publicationDate: publishedAt,
          publishedAt,
          scheduledDate: scheduledAt,
          status: fixture.status,
          targetExecutionState,
          visibility: fixture.status === 'public' ? 'public' : null,
        },
        where: {
          organizationId_targetIdempotencyKey: {
            organizationId,
            targetIdempotencyKey: key,
          },
        },
      });

      if (fixture.status !== 'public') {
        continue;
      }

      const analyticsPlatform = platformEnum(fixturePlatform);
      await prisma.postAnalytics.deleteMany({
        where: {
          platform: { not: analyticsPlatform },
          postId: post.id,
        },
      });

      for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
        const baseline = 900 + brandIndex * 350 + fixtureIndex * 180;
        const totalViews = baseline + (6 - daysAgo) * 170;
        const totalLikes = Math.round(totalViews * 0.075);
        const totalComments = Math.round(totalViews * 0.012);
        const totalShares = Math.round(totalViews * 0.019);
        const totalSaves = Math.round(totalViews * 0.024);
        const date = dayAtMidnight(daysAgo);
        const analytics = {
          averageWatchTimeSeconds:
            fixture.category === PostCategory.VIDEO ? 18 + fixtureIndex : null,
          brandId: brand.id,
          clicks: Math.round(totalViews * 0.035),
          engagementRate:
            ((totalLikes + totalComments + totalShares + totalSaves) /
              totalViews) *
            100,
          impressions: Math.round(totalViews * 1.28),
          metricAvailability: {
            comments: true,
            likes: true,
            shares: true,
            views: true,
          },
          organizationId,
          reach: Math.round(totalViews * 1.08),
          totalComments,
          totalCommentsIncrement: Math.round(totalComments / 7),
          totalLikes,
          totalLikesIncrement: Math.round(totalLikes / 7),
          totalSaves,
          totalSavesIncrement: Math.round(totalSaves / 7),
          totalShares,
          totalSharesIncrement: Math.round(totalShares / 7),
          totalViews,
          totalViewsIncrement: Math.round(totalViews / 7),
          userId,
          videoViews:
            fixture.category === PostCategory.VIDEO ? totalViews : null,
          watchTimeSeconds:
            fixture.category === PostCategory.VIDEO ? totalViews * 18 : null,
        };
        await prisma.postAnalytics.upsert({
          create: {
            ...analytics,
            date,
            platform: analyticsPlatform,
            postId: post.id,
          },
          update: analytics,
          where: {
            postId_platform_date: {
              date,
              platform: analyticsPlatform,
              postId: post.id,
            },
          },
        });
      }

      const performanceKey = `qa-debug-performance-${post.id}`;
      const existingPerformance = await prisma.contentPerformance.findFirst({
        select: { id: true },
        where: {
          data: { equals: { qaSeedKey: performanceKey } },
          isDeleted: false,
          organizationId,
        },
      });
      const performanceData = {
        brandId: brand.id,
        comments: 84 + fixtureIndex * 9,
        contentType: fixture.category.toLowerCase(),
        data: { qaSeedKey: performanceKey },
        engagementRate: 9.8 + brandIndex,
        isDeleted: false,
        likes: 640 + fixtureIndex * 80,
        measuredAt: dayAtMidnight(0),
        organizationId,
        performanceScore: 78 + fixtureIndex * 4,
        platform: fixturePlatform,
        postId: post.id,
        saves: 130 + fixtureIndex * 18,
        shares: 96 + fixtureIndex * 13,
        source: 'qa-debug-seed',
        userId,
        views: 9200 + fixtureIndex * 1600,
      };
      if (existingPerformance) {
        await prisma.contentPerformance.update({
          data: performanceData,
          where: { id: existingPerformance.id },
        });
      } else {
        await prisma.contentPerformance.create({ data: performanceData });
      }
    }
  }
}

async function seedTasks(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  brands: SeedBrand[],
): Promise<void> {
  for (const [index, fixture] of TASK_FIXTURES.entries()) {
    const [identifier, title, status, priority] = fixture;
    const task = await prisma.task.upsert({
      create: {
        brandId: brands[index % brands.length]?.id,
        completedAt: status === 'done' ? dateFromNow(-1) : null,
        config: {
          acceptanceCriteria: [
            'Copy reviewed',
            'Visual checked',
            'Links verified',
          ],
          qaSeedKey: `qa-debug-task-${identifier}`,
        },
        description: `${QA_PREFIX} Representative task content for list, board, detail, and review states.`,
        identifier,
        organizationId,
        priority,
        progress: { completed: status === 'done' ? 3 : index % 3, total: 3 },
        reviewState: status === 'in_review' ? 'pending_approval' : 'none',
        status,
        taskNumber: 101 + index,
        title: `${QA_PREFIX} ${title}`,
        userId,
      },
      update: {
        completedAt: status === 'done' ? dateFromNow(-1) : null,
        isDeleted: false,
        priority,
        reviewState: status === 'in_review' ? 'pending_approval' : 'none',
        status,
        title: `${QA_PREFIX} ${title}`,
      },
      where: { organizationId_identifier: { identifier, organizationId } },
    });

    const commentBody = `${QA_PREFIX} This note makes the task detail state testable.`;
    const existingComment = await prisma.taskComment.findFirst({
      select: { id: true },
      where: {
        body: commentBody,
        isDeleted: false,
        organizationId,
        taskId: task.id,
      },
    });
    if (!existingComment) {
      await prisma.taskComment.create({
        data: {
          authorUserId: userId,
          body: commentBody,
          organizationId,
          taskId: task.id,
        },
      });
    }
  }
}

async function seedMessages(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  brands: SeedBrand[],
): Promise<void> {
  for (const [brandIndex, brand] of brands.entries()) {
    const outreachKey = `qa-debug-outreach-${brand.id}`;
    let outreach = await prisma.outreachCampaign.findFirst({
      select: { id: true },
      where: {
        config: { path: ['qaSeedKey'], equals: outreachKey },
        isDeleted: false,
        organizationId,
      },
    });
    const outreachData = {
      brandId: brand.id,
      campaignType: 'manual',
      config: {
        description: 'A synthetic outreach campaign for table and detail QA.',
        label: `${QA_PREFIX} ${brand.label} creator outreach`,
        qaSeedKey: outreachKey,
        rateLimits: { maxPerDay: 30, maxPerHour: 5 },
        totalDmsSent: 1,
        totalFailed: 1,
        totalReplies: 1,
        totalSkipped: 1,
        totalSuccessful: 2,
        totalTargets: 4,
      },
      isActive: brandIndex === 0,
      isDeleted: false,
      organizationId,
      platform: brandIndex === 0 ? 'twitter' : 'instagram',
      status:
        brandIndex === 0 ? CampaignStatus.ACTIVE : CampaignStatus.COMPLETED,
      userId,
    };
    if (outreach) {
      outreach = await prisma.outreachCampaign.update({
        data: outreachData,
        select: { id: true },
        where: { id: outreach.id },
      });
    } else {
      outreach = await prisma.outreachCampaign.create({
        data: outreachData,
        select: { id: true },
      });
    }

    const targetStatuses = [
      CampaignTargetStatus.PENDING,
      CampaignTargetStatus.SENT,
      CampaignTargetStatus.REPLIED,
      CampaignTargetStatus.FAILED,
    ];
    for (const [targetIndex, status] of targetStatuses.entries()) {
      const externalId = `qa-target-${brand.id}-${targetIndex}`;
      const targetData = {
        data: {
          handle: `qa_creator_${brandIndex}_${targetIndex}`,
          name: `QA Creator ${brandIndex + 1}.${targetIndex + 1}`,
          profileUrl: 'https://example.com/qa-creator',
        },
        errorMessage:
          status === CampaignTargetStatus.FAILED
            ? 'Synthetic QA failure'
            : null,
        isDeleted: false,
        processedAt:
          status === CampaignTargetStatus.PENDING ? null : dateFromNow(-1),
        replyText:
          status === CampaignTargetStatus.REPLIED
            ? 'This looks useful. Tell me more.'
            : null,
        status,
      };
      const existingTarget = await prisma.campaignTarget.findFirst({
        select: { id: true },
        where: {
          campaignId: outreach.id,
          externalId,
          isDeleted: false,
          organizationId,
        },
      });
      if (existingTarget) {
        await prisma.campaignTarget.update({
          data: targetData,
          where: { id: existingTarget.id },
        });
      } else {
        await prisma.campaignTarget.create({
          data: {
            ...targetData,
            campaignId: outreach.id,
            externalId,
            organizationId,
          },
        });
      }
    }

    const conversationKey = `qa-conversation-${brand.id}`;
    const platform = brandIndex === 0 ? 'twitter' : 'instagram';
    const conversation = await prisma.socialConversation.upsert({
      create: {
        brandId: brand.id,
        externalConversationId: conversationKey,
        latestMessageAt: dateFromNow(0, -brandIndex),
        latestMessageText: 'Can your workflow keep our brand voice consistent?',
        lastInboundAt: dateFromNow(0, -brandIndex),
        metadata: { qaSeedKey: conversationKey },
        needsReview: brandIndex === 0,
        organizationId,
        participantHandle: `qa_customer_${brandIndex + 1}`,
        participantName: `QA Customer ${brandIndex + 1}`,
        platform,
        priority: brandIndex === 0 ? 'high' : 'normal',
        status: 'open',
        tags: ['qa-seed', 'product-question'],
        unreadCount: brandIndex === 0 ? 2 : 0,
        userId,
      },
      update: {
        isDeleted: false,
        latestMessageAt: dateFromNow(0, -brandIndex),
        latestMessageText: 'Can your workflow keep our brand voice consistent?',
        needsReview: brandIndex === 0,
        priority: brandIndex === 0 ? 'high' : 'normal',
        unreadCount: brandIndex === 0 ? 2 : 0,
      },
      where: {
        organizationId_platform_externalConversationId: {
          externalConversationId: conversationKey,
          organizationId,
          platform,
        },
      },
    });

    const inboundKey = `qa-message-inbound-${brand.id}`;
    await prisma.socialMessage.upsert({
      create: {
        body: 'Can your workflow keep our brand voice consistent?',
        brandId: brand.id,
        conversationId: conversation.id,
        direction: 'inbound',
        idempotencyKey: inboundKey,
        metadata: { qaSeedKey: inboundKey },
        organizationId,
        platform,
        senderHandle: `qa_customer_${brandIndex + 1}`,
        senderName: `QA Customer ${brandIndex + 1}`,
        status: 'received',
        userId,
      },
      update: {
        body: 'Can your workflow keep our brand voice consistent?',
        isDeleted: false,
      },
      where: {
        organizationId_idempotencyKey: {
          idempotencyKey: inboundKey,
          organizationId,
        },
      },
    });

    const replyCampaignKey = `qa-debug-reply-campaign-${brand.id}`;
    let replyCampaign = await prisma.socialReplyCampaign.findFirst({
      select: { id: true },
      where: {
        isDeleted: false,
        metadata: { path: ['qaSeedKey'], equals: replyCampaignKey },
        organizationId,
      },
    });
    const replyCampaignData = {
      bodyTemplate:
        'Absolutely. The workflow carries approved voice guidance into each generated draft.',
      brandId: brand.id,
      description: 'Synthetic reply-drip campaign for list and detail QA.',
      failedCount: 0,
      isDeleted: false,
      maxPerDay: 25,
      maxPerHour: 5,
      metadata: { qaSeedKey: replyCampaignKey },
      minDelaySeconds: 90,
      name: `${QA_PREFIX} ${brand.label} follow-up`,
      organizationId,
      platform,
      sentCount: brandIndex === 0 ? 0 : 1,
      skippedCount: 0,
      status: brandIndex === 0 ? 'draft' : 'completed',
      totalRecipients: 1,
      userId,
    };
    if (replyCampaign) {
      replyCampaign = await prisma.socialReplyCampaign.update({
        data: replyCampaignData,
        select: { id: true },
        where: { id: replyCampaign.id },
      });
    } else {
      replyCampaign = await prisma.socialReplyCampaign.create({
        data: replyCampaignData,
        select: { id: true },
      });
    }
    await prisma.socialReplyCampaignRecipient.upsert({
      create: {
        body: replyCampaignData.bodyTemplate,
        campaignId: replyCampaign.id,
        conversationId: conversation.id,
        idempotencyKey: `qa-reply-recipient-${brand.id}`,
        metadata: { qaSeedKey: replyCampaignKey },
        organizationId,
        position: 0,
        status: brandIndex === 0 ? 'pending' : 'sent',
      },
      update: {
        body: replyCampaignData.bodyTemplate,
        isDeleted: false,
        status: brandIndex === 0 ? 'pending' : 'sent',
      },
      where: {
        campaignId_conversationId: {
          campaignId: replyCampaign.id,
          conversationId: conversation.id,
        },
      },
    });
  }
}

async function seedDiscoveryAndActivity(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  brands: SeedBrand[],
): Promise<void> {
  for (const [brandIndex, brand] of brands.entries()) {
    const credential = brand.credentials[0];
    if (!credential) {
      continue;
    }
    const platform = credential.platform.toLowerCase();
    const sourceKey = `qa-debug-source-${brand.id}`;
    let source = await prisma.socialSource.findFirst({
      select: { id: true },
      where: {
        brandId: brand.id,
        isDeleted: false,
        metadata: { path: ['qaSeedKey'], equals: sourceKey },
        organizationId,
      },
    });
    const sourceData = {
      bio: 'Synthetic creator source for local Discovery interface QA.',
      brandId: brand.id,
      credentialId: credential.id,
      displayName: `${QA_PREFIX} Creator ${brandIndex + 1}`,
      externalId: sourceKey,
      followersCount: 18_500 + brandIndex * 8_000,
      handle: `qa_seed_creator_${brandIndex + 1}`,
      isActive: true,
      isDeleted: false,
      lastSyncStatus: 'success',
      lastSyncedAt: dateFromNow(0, -1),
      metadata: { qaSeedKey: sourceKey },
      organizationId,
      platform,
      profileUrl: 'https://example.com/qa-seed-creator',
      sourceType: 'account',
      userId,
    };
    if (source) {
      source = await prisma.socialSource.update({
        data: sourceData,
        select: { id: true },
        where: { id: source.id },
      });
    } else {
      source = await prisma.socialSource.create({
        data: sourceData,
        select: { id: true },
      });
    }

    for (let postIndex = 0; postIndex < 3; postIndex += 1) {
      const externalId = `qa-debug-source-post-${brand.id}-${postIndex}`;
      const metrics = {
        comments: 42 + postIndex * 16,
        likes: 1_250 + postIndex * 470,
        shares: 190 + postIndex * 85,
        views: 18_000 + postIndex * 7_500,
      };
      const postData = {
        authorDisplayName: sourceData.displayName,
        authorFollowersCount: sourceData.followersCount,
        authorHandle: sourceData.handle,
        brandId: brand.id,
        collectedAt: dateFromNow(0, -postIndex),
        contentType: postIndex === 1 ? 'video' : 'post',
        hashtags: ['qa-seed', 'content-operations'],
        isDeleted: false,
        metrics,
        organizationId,
        platform,
        publishedAt: dateFromNow(-postIndex - 1),
        raw: { qaSeedKey: externalId },
        sourceUrl: 'https://example.com/qa-seed-post',
        text: `${QA_PREFIX} ${['The systems behind consistent creative output', 'A practical campaign workflow breakdown', 'What high-performing teams review every week'][postIndex]}`,
        userId,
      };
      await prisma.sourcePost.upsert({
        create: { ...postData, externalId, sourceId: source.id },
        update: postData,
        where: { sourceId_externalId: { externalId, sourceId: source.id } },
      });
    }
  }

  for (const [index, fixture] of TREND_FIXTURES.entries()) {
    const [platform, topic, viralityScore, mentions, growthRate] = fixture;
    const key = `qa-debug-trend-${index}`;
    const data = {
      description: `${topic} is accelerating across the synthetic QA dataset.`,
      growthRate,
      mentions,
      qaSeedKey: key,
      source: 'qa-debug-seed',
    };
    const existing = await prisma.trend.findFirst({
      select: { id: true },
      where: {
        data: { path: ['qaSeedKey'], equals: key },
        isDeleted: false,
        organizationId,
      },
    });
    const trendData = {
      brandId: brands[index % brands.length]?.id,
      data,
      expiresAt: dateFromNow(14),
      isCurrent: true,
      isDeleted: false,
      organizationId,
      platform,
      requiresAuth: false,
      topic: `${QA_PREFIX} ${topic}`,
      viralityScore,
    };
    if (existing) {
      await prisma.trend.update({
        data: trendData,
        where: { id: existing.id },
      });
    } else {
      await prisma.trend.create({ data: trendData });
    }
  }

  for (const [index, brand] of brands.entries()) {
    const entityId = `qa-debug-activity-${brand.id}`;
    const existing = await prisma.activity.findFirst({
      select: { id: true },
      where: { entityId, isDeleted: false, organizationId },
    });
    const activityData = {
      action: index === 0 ? 'post.published' : 'campaign.completed',
      brandId: brand.id,
      data: {
        description: `${QA_PREFIX} Synthetic activity for ${brand.label}`,
        qaSeedKey: entityId,
      },
      entityId,
      entityModel: index === 0 ? 'Post' : 'Campaign',
      isDeleted: false,
      organizationId,
      userId,
    };
    if (existing) {
      await prisma.activity.update({
        data: activityData,
        where: { id: existing.id },
      });
    } else {
      await prisma.activity.create({ data: activityData });
    }
  }
}

async function reportSeededRows(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  const [
    campaigns,
    postGroups,
    posts,
    analytics,
    tasks,
    outreach,
    conversations,
    replyCampaigns,
    sourcePosts,
    trends,
  ] = await Promise.all([
    prisma.campaign.count({
      where: { idempotencyKey: { startsWith: 'qa-debug-' }, organizationId },
    }),
    prisma.postGroup.count({
      where: { idempotencyKey: { startsWith: 'qa-debug-' }, organizationId },
    }),
    prisma.post.count({
      where: {
        organizationId,
        targetIdempotencyKey: { startsWith: 'qa-debug-' },
      },
    }),
    prisma.postAnalytics.count({
      where: {
        organizationId,
        post: { targetIdempotencyKey: { startsWith: 'qa-debug-' } },
      },
    }),
    prisma.task.count({
      where: { identifier: { startsWith: 'QA-' }, organizationId },
    }),
    prisma.outreachCampaign.count({
      where: {
        config: { path: ['qaSeedKey'], string_starts_with: 'qa-debug-' },
        organizationId,
      },
    }),
    prisma.socialConversation.count({
      where: {
        externalConversationId: { startsWith: 'qa-conversation-' },
        organizationId,
      },
    }),
    prisma.socialReplyCampaign.count({
      where: {
        metadata: { path: ['qaSeedKey'], string_starts_with: 'qa-debug-' },
        organizationId,
      },
    }),
    prisma.sourcePost.count({
      where: {
        externalId: { startsWith: 'qa-debug-source-post-' },
        organizationId,
      },
    }),
    prisma.trend.count({
      where: {
        data: { path: ['qaSeedKey'], string_starts_with: 'qa-debug-' },
        organizationId,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        analytics,
        campaigns,
        conversations,
        outreach,
        postGroups,
        posts,
        replyCampaigns,
        sourcePosts,
        tasks,
        trends,
      },
      null,
      2,
    ),
  );
}

export async function runLocalDebugDataSeed(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadLocalEnv();
  const databaseUrl = getDatabaseUrl();
  assertLocalDatabase(databaseUrl);
  console.log(
    `Target database: ${databaseUrl.hostname}${databaseUrl.port ? `:${databaseUrl.port}` : ''}${databaseUrl.pathname}`,
  );

  const prisma = createPrismaClient(databaseUrl);
  try {
    const organization = await prisma.organization.findUnique({
      select: {
        brands: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          select: {
            credentials: {
              orderBy: { createdAt: 'asc' },
              select: { id: true, platform: true },
              where: {
                isDeleted: false,
                platform: {
                  in: [
                    CredentialPlatform.INSTAGRAM,
                    CredentialPlatform.TIKTOK,
                    CredentialPlatform.TWITTER,
                    CredentialPlatform.YOUTUBE,
                  ],
                },
              },
            },
            id: true,
            label: true,
          },
          take: 2,
          where: { isActive: true, isDeleted: false },
        },
        id: true,
        label: true,
        userId: true,
      },
      where: { slug: args.organizationSlug },
    });
    if (!organization) {
      throw new Error(`Organization slug not found: ${args.organizationSlug}`);
    }
    const brands = organization.brands.filter(
      (brand) => brand.credentials.length > 0,
    );
    if (brands.length === 0) {
      throw new Error(
        `Organization has no active brands with local credential targets: ${args.organizationSlug}`,
      );
    }

    console.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} local QA seed for ${organization.label} with ${brands.length} brand(s)`,
    );
    if (args.dryRun) {
      console.log(
        'Would upsert publishing, analytics, tasks, messages, discovery, and activity fixtures. Re-run with --live to apply.',
      );
      return;
    }

    await seedPublishing(prisma, organization.id, organization.userId, brands);
    await seedTasks(prisma, organization.id, organization.userId, brands);
    await seedMessages(prisma, organization.id, organization.userId, brands);
    await seedDiscoveryAndActivity(
      prisma,
      organization.id,
      organization.userId,
      brands,
    );
    await reportSeededRows(prisma, organization.id);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  runLocalDebugDataSeed().catch((error) => {
    console.error('Local debug data seed failed', error);
    process.exit(1);
  });
}
