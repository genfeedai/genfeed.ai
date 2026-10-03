import {
  extensionPublicationAnalyticsAvailability,
  extensionPublicationAuthorMatchesCredential,
  extensionPublicationCaptureAnalyticsAvailability,
  extensionPublicationCaptureResult,
  extensionPublicationObservedAuthor,
  isExtensionPublicationCapture,
  normalizeExtensionPublication,
} from '@api/collections/posts/services/post-publication-capture.util';
import { publicationInsightLookupKind } from '@api/collections/posts/services/post-publication-insight-lookup.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  AnalyticsMetricAvailability,
  TargetAnalyticsCollectionState,
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type { ExtensionPublicationPlatform } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type {
  PublicationInsight,
  PublicationInsightMetric,
  PublicationInsightSample,
  PublicationInsightsQuery,
  PublicationInsightsScope,
} from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import { type Post, type PostAnalytics, Prisma } from '@genfeedai/prisma';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';

const platformSchema = z.enum([
  'twitter',
  'linkedin',
  'reddit',
  'youtube',
  'instagram',
  'facebook',
  'tiktok',
]);
const credentialSelect = {
  id: true,
  externalId: true,
  externalHandle: true,
  username: true,
  platform: true,
} satisfies Prisma.CredentialSelect;
type InsightCredential = Prisma.CredentialGetPayload<{
  select: typeof credentialSelect;
}>;

async function assertBrand(
  prisma: PrismaService,
  scope: PublicationInsightsScope,
): Promise<void> {
  if (
    !scope.organizationId?.trim() ||
    !scope.brandId?.trim() ||
    !scope.userId?.trim()
  )
    throw new ForbiddenException(
      'Publication insights require an authenticated organization, user and brand',
    );
  const brand = await prisma.brand.findFirst({
    where: scopedWhere(scope.organizationId, {
      id: scope.brandId,
      isDeleted: false,
    }),
    select: { id: true },
  });
  if (!brand)
    throw new ForbiddenException(
      'Publication brand is unavailable in this organization',
    );
}

function lookupIdentity(
  platform: ExtensionPublicationPlatform,
  pageUrl: string,
): Prisma.PostWhereInput[] {
  const publicationKind = publicationInsightLookupKind(platform, pageUrl);
  const normalized = normalizeExtensionPublication({
    platform,
    publicationKind,
    url: pageUrl,
  });
  if (!normalized.url)
    throw new BadRequestException('Publication URL is unavailable');
  const canonical = new URL(normalized.url);
  const hosts = new Set([canonical.hostname]);
  if (canonical.hostname !== 'old.reddit.com')
    hosts.add(`www.${canonical.hostname}`);
  if (platform === 'twitter') {
    hosts.add('x.com');
    hosts.add('www.x.com');
  }
  const aliases = new Set<string>();
  for (const hostname of hosts) {
    const url = new URL(canonical);
    url.hostname = hostname;
    aliases.add(url.toString());
    url.pathname = url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : `${url.pathname}/`;
    aliases.add(url.toString());
  }
  if (
    platform === 'youtube' &&
    publicationKind === 'post' &&
    normalized.externalId
  ) {
    aliases.add(`https://youtu.be/${normalized.externalId}`);
    aliases.add(`https://youtu.be/${normalized.externalId}/`);
    aliases.add(`https://youtube.com/watch?v=${normalized.externalId}`);
    aliases.add(`https://www.youtube.com/watch?v=${normalized.externalId}`);
    aliases.add(`https://youtube.com/watch/?v=${normalized.externalId}`);
    aliases.add(`https://www.youtube.com/watch/?v=${normalized.externalId}`);
  }
  const identities: Prisma.PostWhereInput[] = [
    { url: { in: [...aliases] } },
    {
      source: 'extension',
      targetSettings: {
        path: ['extensionCapture', 'contextUrl'],
        equals: normalized.url,
      },
    },
  ];
  if (normalized.externalId)
    identities.push({ externalId: normalized.externalId });
  return identities;
}

function publicationWhere(
  query: PublicationInsightsQuery,
  scope: PublicationInsightsScope,
): Prisma.PostWhereInput {
  if (query.brandId !== scope.brandId)
    throw new ForbiddenException(
      'Publication query brand must match its scope',
    );
  const filters: Prisma.PostWhereInput[] = [];
  if (query.pageUrl) {
    if (!query.platform)
      throw new BadRequestException(
        'Platform is required for publication URL lookup',
      );
    filters.push({ OR: lookupIdentity(query.platform, query.pageUrl) });
  }
  if (query.externalId && !query.platform)
    throw new BadRequestException(
      'Platform is required for external ID lookup',
    );
  if (query.search)
    filters.push({
      OR: [
        { label: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  if (query.capturedOnly)
    filters.push({
      source: 'extension',
      targetSettings: { path: ['extensionCapture', 'version'], equals: 1 },
    });
  return scopedWhere(scope.organizationId, {
    brandId: scope.brandId,
    isDeleted: false,
    brand: { organizationId: scope.organizationId, isDeleted: false },
    targetExecutionState: TargetExecutionState.PUBLISHED,
    platform: query.platform ?? { in: platformSchema.options },
    ...(query.source ? { source: query.source } : {}),
    ...(query.credentialId ? { credentialId: { in: query.credentialId } } : {}),
    ...(query.externalId ? { externalId: query.externalId } : {}),
    ...(filters.length ? { AND: filters } : {}),
  });
}

async function latestSamples(
  prisma: PrismaService,
  posts: Post[],
  scope: PublicationInsightsScope,
): Promise<PostAnalytics[]> {
  if (!posts.length) return [];
  return prisma.$queryRaw<PostAnalytics[]>(Prisma.sql`
    SELECT DISTINCT ON (pa."postId", pa.platform) pa.*
    FROM "post_analytics" pa
    JOIN "posts" p ON p.id=pa."postId"
      AND p."organizationId"=pa."organizationId" AND p."brandId"=pa."brandId"
      AND p."isDeleted"=false AND p.platform=lower(pa.platform::text)
    WHERE pa."organizationId"=${scope.organizationId} AND pa."brandId"=${scope.brandId}
      AND pa."isDeleted"=false AND pa."postId" IN (${Prisma.join(posts.map((post) => post.id))})
    ORDER BY pa."postId", pa.platform, pa.date DESC, pa."updatedAt" DESC, pa.id ASC
  `);
}

function metric(
  value: number,
  availability: unknown,
  present: boolean,
): PublicationInsightMetric {
  const finite = Number.isFinite(value) && value >= 0;
  if (availability === AnalyticsMetricAvailability.OBSERVED && finite)
    return { value, availability: AnalyticsMetricAvailability.OBSERVED };
  if (!present && finite && value > 0)
    return { value, availability: AnalyticsMetricAvailability.OBSERVED };
  const known = Object.values(AnalyticsMetricAvailability).find(
    (entry) => entry === availability,
  );
  return {
    value: null,
    availability:
      known && known !== AnalyticsMetricAvailability.OBSERVED
        ? known
        : AnalyticsMetricAvailability.UNAVAILABLE,
  };
}

function sampleProjection(
  row: PostAnalytics | undefined,
): PublicationInsightSample | null {
  if (!row) return null;
  const parsed = z
    .record(z.string(), z.unknown())
    .safeParse(row.metricAvailability);
  const availability = parsed.success ? parsed.data : {};
  const read = (key: string, value: number) =>
    metric(value, availability[key], Object.hasOwn(availability, key));
  return {
    date: row.date.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    metrics: {
      views: read('views', row.totalViews),
      likes: read('likes', row.totalLikes),
      comments: read('comments', row.totalComments),
      shares: read('shares', row.totalShares),
      saves: read('saves', row.totalSaves),
    },
  };
}

function safeMessage(
  insight: Pick<
    PublicationInsight,
    | 'analyticsAvailability'
    | 'collectionState'
    | 'isCapturedObservation'
    | 'linkCandidates'
  >,
  hasAuthor: boolean,
): string | null {
  switch (insight.analyticsAvailability) {
    case 'missing-credential':
      return insight.isCapturedObservation && !hasAuthor
        ? 'This recording has no observed author to link. Connect the original account to recover analytics.'
        : 'Connect or reconnect the matching account to collect analytics.';
    case 'missing-external-id':
      return 'This publication has no provider ID for analytics collection.';
    case 'provider-id-unresolved':
      return 'The saved URL identity has not resolved to a provider publication ID.';
    case 'unsupported-platform':
      return 'Analytics collection is unavailable for this platform.';
    case 'unsupported-publication-kind':
      return 'Analytics collection is unavailable for this publication kind.';
  }
  switch (insight.collectionState) {
    case TargetAnalyticsCollectionState.FAILED:
      return 'Analytics collection failed. Last saved metrics remain available.';
    case TargetAnalyticsCollectionState.PENDING:
      return 'Awaiting analytics collection.';
    case TargetAnalyticsCollectionState.STALE:
      return 'These are the last saved metrics; an update is needed.';
    case TargetAnalyticsCollectionState.UNAVAILABLE:
      return 'Analytics collection is currently unavailable.';
    default:
      return null;
  }
}

function projectPublication(
  post: Post,
  credentials: InsightCredential[],
  samples: PostAnalytics[],
  scope: PublicationInsightsScope,
): PublicationInsight {
  const platform = platformSchema.parse(post.platform);
  const mapped = toPrismaCredentialPlatform(platform);
  const captured = isExtensionPublicationCapture(post);
  const identity = extensionPublicationCaptureResult(
    { ...post, targetSettings: captured ? post.targetSettings : {} },
    false,
  );
  const credential = credentials.find(
    (entry) => entry.id === post.credentialId && entry.platform === mapped,
  );
  const author = extensionPublicationObservedAuthor(post.targetSettings);
  const metadata = z
    .object({
      extensionCapture: z.object({
        publicationKind: z.enum(['post', 'reply']).optional(),
      }),
    })
    .safeParse(post.targetSettings);
  const publicationKind = captured
    ? metadata.success
      ? (metadata.data.extensionCapture.publicationKind ?? 'unknown')
      : 'unknown'
    : 'post';
  const analyticsAvailability = captured
    ? extensionPublicationCaptureAnalyticsAvailability({
        ...post,
        credentialId: credential?.id ?? null,
      })
    : extensionPublicationAnalyticsAvailability(
        post.externalId,
        credential?.id ?? null,
        platform,
        'post',
      );
  const latestSample = sampleProjection(
    samples.find(
      (sample) => sample.postId === post.id && sample.platform === mapped,
    ),
  );
  let collectionState =
    Object.values(TargetAnalyticsCollectionState).find(
      (state) => state === post.analyticsCollectionState,
    ) ?? TargetAnalyticsCollectionState.UNAVAILABLE;
  if (
    analyticsAvailability === 'eligible' &&
    !latestSample &&
    collectionState === TargetAnalyticsCollectionState.UNAVAILABLE
  )
    collectionState = TargetAnalyticsCollectionState.PENDING;
  const linkCandidates =
    captured && !post.credentialId
      ? credentials
          .filter(
            (entry) =>
              entry.platform === mapped &&
              extensionPublicationAuthorMatchesCredential(author, entry),
          )
          .map((entry) => ({
            id: entry.id,
            label:
              entry.externalHandle?.trim() ||
              entry.username?.trim() ||
              `${platform} ${entry.id.slice(-6)}`,
          }))
      : [];
  const projection: PublicationInsight = {
    id: post.id,
    organizationId: scope.organizationId,
    brandId: scope.brandId,
    source: post.source,
    platform,
    description: post.description,
    publicationDate: post.publicationDate?.toISOString() ?? null,
    isCapturedObservation: captured,
    publicationKind,
    externalId: post.externalId,
    url: identity.url,
    contextUrl: identity.contextUrl,
    urlKind: identity.urlKind,
    urlIdentity: identity.urlIdentity,
    observedVisibility: identity.observedVisibility,
    credentialId: post.credentialId,
    analyticsAvailability,
    collectionState,
    collectionMessage: null,
    latestSample,
    linkCandidates,
  };
  projection.collectionMessage = safeMessage(projection, !!author);
  return projection;
}

async function projectPage(
  prisma: PrismaService,
  posts: Post[],
  scope: PublicationInsightsScope,
): Promise<PublicationInsight[]> {
  if (!posts.length) return [];
  const platforms = [
    ...new Set(
      posts
        .map((post) => toPrismaCredentialPlatform(post.platform))
        .filter((platform) => platform !== undefined),
    ),
  ];
  const credentials = await prisma.credential.findMany({
    where: scopedWhere(scope.organizationId, {
      brandId: scope.brandId,
      isDeleted: false,
      isConnected: true,
      platform: { in: platforms },
    }),
    select: credentialSelect,
  });
  const samples = await latestSamples(prisma, posts, scope);
  return posts.map((post) =>
    projectPublication(post, credentials, samples, scope),
  );
}

export async function listPublicationInsights(
  prisma: PrismaService,
  query: PublicationInsightsQuery,
  scope: PublicationInsightsScope,
): Promise<AggregatePaginateResult<PublicationInsight>> {
  await assertBrand(prisma, scope);
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new BadRequestException('Invalid publication pagination');
  const where = publicationWhere(query, scope);
  const totalDocs = await prisma.post.count({
    where: scopedWhere(scope.organizationId, {
      ...where,
      brandId: scope.brandId,
      isDeleted: false,
    }),
  });
  const posts = await prisma.post.findMany({
    where: scopedWhere(scope.organizationId, {
      ...where,
      brandId: scope.brandId,
      isDeleted: false,
    }),
    take: limit,
    skip: (page - 1) * limit,
    orderBy: [
      { publicationDate: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'asc' },
    ],
  });
  const docs = await projectPage(prisma, posts, scope);
  const totalPages = Math.ceil(totalDocs / limit);
  return {
    docs,
    totalDocs,
    limit,
    page,
    totalPages,
    pagingCounter: (page - 1) * limit + 1,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null,
  };
}

export async function findPublicationInsight(
  prisma: PrismaService,
  postId: string,
  scope: PublicationInsightsScope,
): Promise<PublicationInsight | null> {
  await assertBrand(prisma, scope);
  const post = await prisma.post.findFirst({
    where: scopedWhere(scope.organizationId, {
      ...publicationWhere({ brandId: scope.brandId }, scope),
      id: postId,
      brandId: scope.brandId,
      isDeleted: false,
    }),
  });
  if (!post) return null;
  const docs = await projectPage(prisma, [post], scope);
  return docs[0];
}
