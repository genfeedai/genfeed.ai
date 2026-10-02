import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationDependencyRefsV1,
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
  loadLearningPublicationAssociationV1,
  parseLearningPublicationSourceV1,
  resolveLearningPublicationSourceV1,
  validLearningCheckpointPublicationV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import {
  type LearningPublicationApprovalRow,
  type LearningPublicationAssociationV1,
  type LearningPublicationBrandRow,
  type LearningPublicationCredentialRow,
  type LearningPublicationFinalizationRow,
  type LearningPublicationOrganizationRow,
  type LearningPublicationPinRow,
  type LearningPublicationPostRow,
  type LearningPublicationPostVersionInputV1,
  type LearningPublicationSourceV1,
  learningPublicationApprovalSelect,
  learningPublicationBrandSelect,
  learningPublicationCredentialSelect,
  learningPublicationFinalizationSelect,
  learningPublicationOrganizationSelect,
  learningPublicationPinSelect,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  fromPrismaCredentialPlatform,
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  type ContentLearningCheckpoint,
  type ContentLearningDependency,
  type Prisma,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
const published = new Date('2026-10-01T00:00:00.000Z');
const observed = new Date('2026-10-03T00:00:00.000Z');
function postVersionInput(
  overrides: Partial<LearningPublicationPostVersionInputV1> = {},
): LearningPublicationPostVersionInputV1 {
  return {
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId: 'post',
    platform: Platform.TWITTER,
    externalId: 'external',
    publishedAt: published.toISOString(),
    description: 'exact text',
    ...overrides,
  };
}
function association(
  overrides: Partial<LearningPublicationAssociationV1> = {},
): LearningPublicationAssociationV1 {
  return {
    version: 1,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId: 'post',
    approvalId: 'approval',
    approvalOperationId: 'operation',
    versionPinId: 'pin',
    platform: Platform.TWITTER,
    externalId: 'external',
    publishedAt: published.toISOString(),
    contentDigest: `sha256:v1:${'a'.repeat(64)}`,
    postSourceVersion: learningPublicationPostVersionV1(postVersionInput()),
    ...overrides,
  };
}
function source(input = association()): LearningPublicationSourceV1 {
  return {
    ...input,
    finalizationId: 'finalization',
    finalizationVersion: learningPublicationFinalizationVersionV1(input),
    approvalVersion: 'b'.repeat(64),
  };
}
function present<T>(row: T): T | null {
  return row;
}
async function fixture() {
  const post: LearningPublicationPostRow = {
    id: 'post',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    isDeleted: false,
    category: PostCategory.TEXT,
    description: 'exact text',
    entityArticleId: null,
    entityIngredientId: null,
    entityModel: null,
    groupId: null,
    isRepeat: false,
    isShareToFeedSelected: true,
    label: null,
    maxRepeats: null,
    nextScheduledDate: null,
    order: 0,
    originalPostId: null,
    parentId: null,
    platform: Platform.TWITTER,
    publishIntent: null,
    quoteTweetId: null,
    repeatDaysOfWeek: [],
    repeatEndDate: null,
    repeatFrequency: null,
    repeatInterval: null,
    scheduleSlot: null,
    scheduledDate: null,
    targetAttachments: [],
    targetSettings: {},
    timezone: 'UTC',
    variantId: null,
    format: PostFormat.STANDARD,
    visibility: PostVisibility.PUBLIC,
    targetExecutionState: TargetExecutionState.PUBLISHED,
    externalId: 'external',
    publishedAt: published,
    publishApprovalId: 'approval',
    reviewVersionPinId: 'pin',
    _count: { ingredients: 0, children: 0 },
  };
  const organization: LearningPublicationOrganizationRow = {
    id: 'org',
    isDeleted: false,
  };
  const brand: LearningPublicationBrandRow = {
    id: 'brand',
    organizationId: 'org',
    isDeleted: false,
    isActive: true,
  };
  const credential: LearningPublicationCredentialRow = {
    id: 'credential',
    organizationId: 'org',
    brandId: 'brand',
    isDeleted: false,
    isConnected: true,
    platform: 'TWITTER',
  };
  const approval: LearningPublicationApprovalRow = {
    id: 'approval',
    organizationId: 'org',
    brandId: 'brand',
    postId: 'post',
    artifactVersionPinId: 'pin',
    operationId: 'operation',
    status: PublishApprovalStatus.PUBLISHED,
    invalidatedAt: null,
    scopeDigest: 'actual scope digest',
  };
  const pin: LearningPublicationPinRow = {
    id: 'pin',
    organizationId: 'org',
    brandId: 'brand',
    recordKind: 'post',
    recordId: 'post',
    contentDigest: 'pending',
  };
  const finalization: LearningPublicationFinalizationRow = {
    id: 'finalization',
    organizationId: 'org',
    postId: 'post',
    result: {},
  };
  const checkpoint: ContentLearningCheckpoint = {
    id: 'checkpoint',
    isDeleted: false,
    createdAt: observed,
    updatedAt: observed,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId: 'post',
    windowId: '48h-v1',
    revision: 2,
    sourceAttemptId: 'attempt',
    dueAt: observed,
    requestStartedAt: observed,
    receivedAt: observed,
    providerAsOf: null,
    sourceAnalyticsId: 'analytics',
    measurement: {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
      measurement: { exposure: 1000, weightedActions: 10 },
    },
    format: 'text',
    publishedAt: published,
    organicProvenance: { isPaid: false, isPinned: false, source: 'provider' },
    sourceFingerprint: 'physical-source',
    supersedesId: null,
    validity: 'valid',
    attestation: null,
  };
  const edges: ContentLearningDependency[] = [];
  const ancestry: ContentLearningDependency[] = [];
  const state = {
    post: present(post),
    organization: present(organization),
    brand: present(brand),
    credential: present(credential),
    approval: present(approval),
    pin: present(pin),
    finalization: present(finalization),
    checkpoint: present(checkpoint),
  };
  const trace: string[] = [];
  const blocked = vi.fn(() => {
    throw new Error('Forbidden transaction/lock/write');
  });
  const delegates = {
    post: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.PostFindFirstArgs,
          ): Promise<LearningPublicationPostRow | null> => {
            trace.push('post');
            return structuredClone(state.post);
          },
        ),
      create: blocked,
      update: blocked,
      updateMany: blocked,
    },
    organization: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.OrganizationFindFirstArgs,
          ): Promise<LearningPublicationOrganizationRow | null> => {
            trace.push('organization');
            return structuredClone(state.organization);
          },
        ),
      updateMany: blocked,
    },
    brand: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.BrandFindFirstArgs,
          ): Promise<LearningPublicationBrandRow | null> => {
            trace.push('brand');
            return structuredClone(state.brand);
          },
        ),
      updateMany: blocked,
    },
    credential: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.CredentialFindFirstArgs,
          ): Promise<LearningPublicationCredentialRow | null> => {
            trace.push('credential');
            return structuredClone(state.credential);
          },
        ),
      updateMany: blocked,
    },
    publishApproval: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.PublishApprovalFindFirstArgs,
          ): Promise<LearningPublicationApprovalRow | null> => {
            trace.push('approval');
            return structuredClone(state.approval);
          },
        ),
      create: blocked,
      updateMany: blocked,
    },
    contentVersionPin: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.ContentVersionPinFindFirstArgs,
          ): Promise<LearningPublicationPinRow | null> => {
            trace.push('pin');
            return structuredClone(state.pin);
          },
        ),
      create: blocked,
      updateMany: blocked,
    },
    postPublishFinalization: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.PostPublishFinalizationFindFirstArgs,
          ): Promise<LearningPublicationFinalizationRow | null> => {
            trace.push('finalization');
            return structuredClone(state.finalization);
          },
        ),
      create: blocked,
      updateMany: blocked,
    },
    contentLearningCheckpoint: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async (
            _args: Prisma.ContentLearningCheckpointFindFirstArgs,
          ): Promise<ContentLearningCheckpoint | null> => {
            trace.push('checkpoint');
            return structuredClone(state.checkpoint);
          },
        ),
      create: blocked,
      updateMany: blocked,
    },
    contentLearningDependency: {
      findMany: vi
        .fn()
        .mockImplementation(
          async (
            args: Prisma.ContentLearningDependencyFindManyArgs,
          ): Promise<ContentLearningDependency[]> => {
            trace.push(args.take === 9 ? 'edges' : 'ancestry');
            if (args.take === 9)
              return structuredClone(
                edges.filter((edge) => !edge.isDeleted).slice(0, 9),
              );
            return structuredClone(
              ancestry
                .filter(
                  (edge) =>
                    !edge.isDeleted &&
                    (args.where?.OR
                      ? edge.derivedOrganizationId === 'org'
                      : edge.derivedKind === 'config' &&
                        edge.derivedOrganizationId === null),
                )
                .slice(0, 1),
            );
          },
        ),
      create: blocked,
      updateMany: blocked,
    },
    $transaction: blocked,
    $queryRaw: blocked,
    $executeRaw: blocked,
  };
  const module = await Test.createTestingModule({
    providers: [{ provide: PrismaService, useValue: delegates }],
  }).compile();
  const tx = module.get<PrismaService>(PrismaService);
  function mint() {
    pin.contentDigest = buildArtifactContentDigest({
      ...projectPostArtifactMaterial(
        readArtifactRecord({ ...post, ingredients: [] }),
      ),
      children: [],
    });
    const platform = fromPrismaCredentialPlatform(credential.platform);
    if (!platform) throw new Error('Unavailable fixture platform');
    const input = association({
      platform,
      contentDigest: pin.contentDigest,
      postSourceVersion: learningPublicationPostVersionV1(
        postVersionInput({ platform, description: post.description }),
      ),
    });
    finalization.result = {
      success: true,
      isProviderDraft: false,
      executionState: TargetExecutionState.PUBLISHED,
      platform: post.platform,
      externalId: post.externalId,
      learningPublication: { ...input },
    };
    return input;
  }
  const input = mint();
  const resolved = source({ ...input });
  resolved.approvalVersion = learningHash([
    'learning-publication-approval-v1',
    'org',
    'brand',
    'post',
    'approval',
    'operation',
    'pin',
    pin.contentDigest,
    approval.scopeDigest,
  ]);
  function installEdges(value = resolved) {
    edges.splice(
      0,
      edges.length,
      ...learningPublicationDependencyRefsV1(value).map((ref, index) => ({
        id: `edge-${index}`,
        isDeleted: false,
        createdAt: observed,
        updatedAt: observed,
        sourceKind: ref.kind,
        sourceId: ref.id,
        sourceOrganizationId: ref.organizationId,
        sourceVersion: ref.version,
        derivedKind: 'checkpoint',
        derivedId: 'checkpoint',
        derivedOrganizationId: 'org',
        valid: true,
        invalidatedAt: null,
      })),
    );
  }
  installEdges();
  return {
    post,
    organization,
    brand,
    credential,
    approval,
    pin,
    finalization,
    checkpoint,
    edges,
    ancestry,
    state,
    trace,
    blocked,
    delegates,
    tx,
    mint,
    input,
    resolved,
    installEdges,
  };
}

describe('publication transport and fixed identities', () => {
  it('T1 fixes Post/finalization positional golden vectors and digest domains', () => {
    const post = postVersionInput();
    const input = association();
    expect(learningPublicationPostVersionV1(post)).toBe(
      learningHash([
        'learning-publication-post-v1',
        'org',
        'brand',
        'credential',
        'post',
        'twitter',
        'external',
        '2026-10-01T00:00:00.000Z',
        'text',
        'exact text',
      ]),
    );
    expect(learningPublicationFinalizationVersionV1(input)).toBe(
      learningHash([
        'learning-publication-finalization-v1',
        1,
        'org',
        'brand',
        'credential',
        'post',
        'approval',
        'operation',
        'pin',
        'twitter',
        'external',
        '2026-10-01T00:00:00.000Z',
        `sha256:v1:${'a'.repeat(64)}`,
        input.postSourceVersion,
      ]),
    );
    expect(input.postSourceVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(input.contentDigest).toMatch(/^sha256:v1:/);
    const reversed = postVersionInput();
    Reflect.deleteProperty(reversed, 'organizationId');
    Reflect.set(reversed, 'organizationId', 'org');
    expect(learningPublicationPostVersionV1(reversed)).toBe(
      input.postSourceVersion,
    );
    const reordered = association();
    Reflect.deleteProperty(reordered, 'version');
    Reflect.set(reordered, 'version', 1);
    expect(learningPublicationFinalizationVersionV1(reordered)).toBe(
      learningPublicationFinalizationVersionV1(input),
    );
  });
  it('T1 binds each Post identity, exact text/Unicode/CRLF/whitespace and publication time', () => {
    const input = postVersionInput();
    const original = learningPublicationPostVersionV1(input);
    for (const key of [
      'organizationId',
      'brandId',
      'credentialId',
      'postId',
      'externalId',
      'description',
    ]) {
      const changed = postVersionInput();
      Reflect.set(changed, key, `${Reflect.get(changed, key)}|é\r\n `);
      expect(learningPublicationPostVersionV1(changed)).not.toBe(original);
    }
    expect(
      learningPublicationPostVersionV1(
        postVersionInput({ platform: Platform.FACEBOOK }),
      ),
    ).not.toBe(original);
    expect(
      learningPublicationPostVersionV1(
        postVersionInput({ publishedAt: '2026-10-01T00:00:00.001Z' }),
      ),
    ).not.toBe(original);
    expect(
      learningPublicationPostVersionV1(
        postVersionInput({ organizationId: 'org|brand', brandId: 'tail' }),
      ),
    ).not.toBe(
      learningPublicationPostVersionV1(
        postVersionInput({ organizationId: 'org', brandId: 'brand|tail' }),
      ),
    );
    expect(
      learningPublicationPostVersionV1(postVersionInput({ description: 'é' })),
    ).not.toBe(
      learningPublicationPostVersionV1(
        postVersionInput({ description: 'e\u0301' }),
      ),
    );
    expect(
      learningPublicationPostVersionV1(
        postVersionInput({ description: 'a\r\nb' }),
      ),
    ).not.toBe(
      learningPublicationPostVersionV1(
        postVersionInput({ description: 'a\nb' }),
      ),
    );
  });
  it('T1 binds every association field in finalization identity', () => {
    const original = learningPublicationFinalizationVersionV1(association());
    for (const key of [
      'organizationId',
      'brandId',
      'credentialId',
      'postId',
      'approvalId',
      'approvalOperationId',
      'versionPinId',
      'externalId',
    ]) {
      const changed = association();
      Reflect.set(changed, key, `${Reflect.get(changed, key)}-changed`);
      expect(learningPublicationFinalizationVersionV1(changed)).not.toBe(
        original,
      );
    }
    for (const changed of [
      association({ platform: Platform.FACEBOOK }),
      association({ publishedAt: '2026-10-01T00:00:00.001Z' }),
      association({ contentDigest: `sha256:v1:${'c'.repeat(64)}` }),
      association({ postSourceVersion: 'c'.repeat(64) }),
    ])
      expect(learningPublicationFinalizationVersionV1(changed)).not.toBe(
        original,
      );
  });
  it('T2 parses exactly sixteen own data fields and preserves operation whitespace', () => {
    const good = source(association({ approvalOperationId: ' operation ' }));
    expect(Object.keys(good)).toHaveLength(16);
    expect(parseLearningPublicationSourceV1(good)).toEqual(good);
    for (const key of Object.keys(good)) {
      const bad = structuredClone(good);
      Reflect.deleteProperty(bad, key);
      expect(parseLearningPublicationSourceV1(bad)).toBeNull();
    }
    const extra = structuredClone(good);
    Reflect.set(extra, 'approved', true);
    expect(parseLearningPublicationSourceV1(extra)).toBeNull();
    for (const bad of [null, [], 1, 'source', { ...good, version: 2 }])
      expect(parseLearningPublicationSourceV1(bad)).toBeNull();
    for (const key of Object.keys(good)) {
      const bad = structuredClone(good);
      Reflect.set(bad, key, key === 'version' ? '1' : 1);
      expect(parseLearningPublicationSourceV1(bad)).toBeNull();
    }
    const getter = vi.fn(() => 'org');
    const accessor = structuredClone(good);
    Object.defineProperty(accessor, 'organizationId', {
      get: getter,
      enumerable: true,
    });
    expect(parseLearningPublicationSourceV1(accessor)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
  it('T2 rejects incorrect enum/hash/date grammar, limits and finalization tampering', () => {
    const good = source();
    for (const platform of ['TWITTER', ' twitter', 'unknown'])
      expect(
        parseLearningPublicationSourceV1({ ...good, platform }),
      ).toBeNull();
    for (const key of [
      'postSourceVersion',
      'approvalVersion',
      'finalizationVersion',
    ])
      for (const value of [
        'A'.repeat(64),
        'a'.repeat(63),
        `sha256:v1:${'a'.repeat(64)}`,
      ]) {
        const bad = structuredClone(good);
        Reflect.set(bad, key, value);
        expect(parseLearningPublicationSourceV1(bad)).toBeNull();
      }
    for (const contentDigest of ['a'.repeat(64), `sha256:v1:${'A'.repeat(64)}`])
      expect(
        parseLearningPublicationSourceV1({ ...good, contentDigest }),
      ).toBeNull();
    for (const publishedAt of [
      '2026-10-01T00:00:00Z',
      '2026-10-01T01:00:00.000+01:00',
      'invalid',
    ])
      expect(
        parseLearningPublicationSourceV1({ ...good, publishedAt }),
      ).toBeNull();
    for (const key of [
      'organizationId',
      'brandId',
      'credentialId',
      'postId',
      'approvalId',
      'approvalOperationId',
      'versionPinId',
      'finalizationId',
    ])
      for (const value of ['', 'a'.repeat(257)]) {
        const bad = structuredClone(good);
        Reflect.set(bad, key, value);
        expect(parseLearningPublicationSourceV1(bad)).toBeNull();
      }
    expect(
      parseLearningPublicationSourceV1({
        ...good,
        externalId: 'x'.repeat(2049),
      }),
    ).toBeNull();
    expect(
      parseLearningPublicationSourceV1({
        ...good,
        finalizationVersion: 'c'.repeat(64),
      }),
    ).toBeNull();
    for (const description of ['', 'x'.repeat(65537)])
      expect(() =>
        learningPublicationPostVersionV1(postVersionInput({ description })),
      ).toThrow(BadRequestException);
    expect(() =>
      learningPublicationPostVersionV1(
        postVersionInput({ externalId: 'x'.repeat(2049) }),
      ),
    ).toThrow('Invalid learning publication source');
    const missing = association();
    Reflect.deleteProperty(missing, 'approvalId');
    expect(() => learningPublicationFinalizationVersionV1(missing)).toThrow(
      'Invalid learning publication source',
    );
    const wrongVersion = structuredClone(good);
    Reflect.set(wrongVersion, 'version', 2);
    expect(() => learningPublicationDependencyRefsV1(wrongVersion)).toThrow(
      'Invalid learning publication source',
    );
  });
});

describe('same-client publication source authority', () => {
  const platforms: Array<{
    platform: Platform;
    credential: LearningPublicationCredentialRow['platform'];
  }> = [
    { platform: Platform.TWITTER, credential: 'TWITTER' },
    { platform: Platform.FACEBOOK, credential: 'FACEBOOK' },
    { platform: Platform.THREADS, credential: 'THREADS' },
    { platform: Platform.LINKEDIN, credential: 'LINKEDIN' },
  ];
  it.each(platforms)(
    'T3 mints and resolves current managed $platform text on the supplied client',
    async ({ platform, credential }) => {
      const f = await fixture();
      f.post.platform = platform;
      f.credential.platform = credential;
      const association = f.mint();
      expect(
        await loadLearningPublicationAssociationV1(f.tx, 'org', 'post'),
      ).toEqual(association);
      const resolved = await resolveLearningPublicationSourceV1(
        f.tx,
        'org',
        'post',
      );
      expect(resolved).toMatchObject({
        ...association,
        finalizationId: 'finalization',
      });
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  it('T3 uses the exact seven scoped predicates/selects and only published resolution', async () => {
    const f = await fixture();
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).toEqual(f.resolved);
    expect(f.trace).toEqual([
      'post',
      'organization',
      'brand',
      'credential',
      'approval',
      'pin',
      'finalization',
    ]);
    expect(f.delegates.post.findFirst).toHaveBeenCalledWith({
      where: { id: 'post', organizationId: 'org', isDeleted: false },
      select: learningPublicationPostSelect,
    });
    expect(f.delegates.organization.findFirst).toHaveBeenCalledWith({
      where: { id: 'org', isDeleted: false },
      select: learningPublicationOrganizationSelect,
    });
    expect(f.delegates.brand.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'brand',
        organizationId: 'org',
        isDeleted: false,
        isActive: true,
      },
      select: learningPublicationBrandSelect,
    });
    expect(f.delegates.credential.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'credential',
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        isConnected: true,
      },
      select: learningPublicationCredentialSelect,
    });
    expect(f.delegates.publishApproval.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'approval',
        organizationId: 'org',
        brandId: 'brand',
        postId: 'post',
        artifactVersionPinId: 'pin',
      },
      select: learningPublicationApprovalSelect,
    });
    expect(f.delegates.contentVersionPin.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'pin',
        organizationId: 'org',
        brandId: 'brand',
        recordKind: 'post',
        recordId: 'post',
      },
      select: learningPublicationPinSelect,
    });
    expect(f.delegates.postPublishFinalization.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org', postId: 'post' },
      select: learningPublicationFinalizationSelect,
    });
    f.approval.status = PublishApprovalStatus.EXECUTING;
    expect(
      await loadLearningPublicationAssociationV1(f.tx, 'org', 'post'),
    ).toEqual(f.input);
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).toBeNull();
    expect(f.blocked).not.toHaveBeenCalled();
  });
  const unavailable: Array<{
    name: string;
    change: (f: Awaited<ReturnType<typeof fixture>>) => void;
  }> = [
    {
      name: 'missing post',
      change: (f) => {
        f.state.post = null;
      },
    },
    {
      name: 'deleted post',
      change: (f) => {
        f.post.isDeleted = true;
      },
    },
    {
      name: 'foreign post',
      change: (f) => {
        f.post.organizationId = 'foreign';
      },
    },
    {
      name: 'missing organization',
      change: (f) => {
        f.state.organization = null;
      },
    },
    {
      name: 'deleted organization',
      change: (f) => {
        f.organization.isDeleted = true;
      },
    },
    {
      name: 'foreign organization',
      change: (f) => {
        f.organization.id = 'foreign';
      },
    },
    {
      name: 'missing brand',
      change: (f) => {
        f.state.brand = null;
      },
    },
    {
      name: 'deleted brand',
      change: (f) => {
        f.brand.isDeleted = true;
      },
    },
    {
      name: 'inactive brand',
      change: (f) => {
        f.brand.isActive = false;
      },
    },
    {
      name: 'foreign brand',
      change: (f) => {
        f.brand.organizationId = 'foreign';
      },
    },
    {
      name: 'missing credential',
      change: (f) => {
        f.state.credential = null;
      },
    },
    {
      name: 'deleted credential',
      change: (f) => {
        f.credential.isDeleted = true;
      },
    },
    {
      name: 'foreign credential',
      change: (f) => {
        f.credential.organizationId = 'foreign';
      },
    },
    {
      name: 'wrong credential brand',
      change: (f) => {
        f.credential.brandId = 'foreign';
      },
    },
    {
      name: 'disconnected credential',
      change: (f) => {
        f.credential.isConnected = false;
      },
    },
    {
      name: 'unknown platform',
      change: (f) => {
        Reflect.set(f.credential, 'platform', 'UNKNOWN');
      },
    },
    {
      name: 'null credential ID',
      change: (f) => {
        f.post.credentialId = null;
      },
    },
    {
      name: 'null approval ID',
      change: (f) => {
        f.post.publishApprovalId = null;
      },
    },
    {
      name: 'null pin ID',
      change: (f) => {
        f.post.reviewVersionPinId = null;
      },
    },
    {
      name: 'missing approval',
      change: (f) => {
        f.state.approval = null;
      },
    },
    {
      name: 'foreign approval',
      change: (f) => {
        f.approval.organizationId = 'foreign';
      },
    },
    {
      name: 'wrong approval post',
      change: (f) => {
        f.approval.postId = 'other';
      },
    },
    {
      name: 'wrong approval pin',
      change: (f) => {
        f.approval.artifactVersionPinId = 'other';
      },
    },
    {
      name: 'empty operation',
      change: (f) => {
        f.approval.operationId = '';
      },
    },
    {
      name: 'empty approval scope',
      change: (f) => {
        f.approval.scopeDigest = '';
      },
    },
    {
      name: 'revoked approval',
      change: (f) => {
        f.approval.invalidatedAt = observed;
      },
    },
    {
      name: 'failed approval',
      change: (f) => {
        f.approval.status = PublishApprovalStatus.FAILED;
      },
    },
    {
      name: 'missing pin',
      change: (f) => {
        f.state.pin = null;
      },
    },
    {
      name: 'foreign pin',
      change: (f) => {
        f.pin.organizationId = 'foreign';
      },
    },
    {
      name: 'wrong pin brand',
      change: (f) => {
        f.pin.brandId = 'other';
      },
    },
    {
      name: 'wrong pin ID',
      change: (f) => {
        f.pin.id = 'other';
      },
    },
    {
      name: 'wrong record kind',
      change: (f) => {
        f.pin.recordKind = 'article';
      },
    },
    {
      name: 'wrong record ID',
      change: (f) => {
        f.pin.recordId = 'other';
      },
    },
    {
      name: 'wrong pin digest',
      change: (f) => {
        f.pin.contentDigest = 'unversioned';
      },
    },
  ];
  it.each(unavailable)(
    'T4 refuses $name without writes or invented authority',
    async ({ change }) => {
      const f = await fixture();
      change(f);
      expect(
        await loadLearningPublicationAssociationV1(f.tx, 'org', 'post'),
      ).toBeNull();
      expect(
        await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
      ).toBeNull();
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  const unsupported: Array<{
    name: string;
    change: (f: Awaited<ReturnType<typeof fixture>>) => void;
  }> = [
    {
      name: 'media',
      change: (f) => {
        f.post.category = PostCategory.IMAGE;
      },
    },
    {
      name: 'article',
      change: (f) => {
        f.post.entityArticleId = 'article';
      },
    },
    {
      name: 'ingredient entity',
      change: (f) => {
        f.post.entityIngredientId = 'ingredient';
      },
    },
    {
      name: 'entity model',
      change: (f) => {
        Reflect.set(f.post, 'entityModel', 'ARTICLE');
      },
    },
    {
      name: 'thread child',
      change: (f) => {
        f.post.parentId = 'parent';
      },
    },
    {
      name: 'ingredient link',
      change: (f) => {
        f.post._count.ingredients = 1;
      },
    },
    {
      name: 'live child',
      change: (f) => {
        f.post._count.children = 1;
      },
    },
    {
      name: 'attachment',
      change: (f) => {
        f.post.targetAttachments = ['media'];
      },
    },
    {
      name: 'malformed attachments',
      change: (f) => {
        f.post.targetAttachments = {};
      },
    },
    {
      name: 'quote',
      change: (f) => {
        f.post.quoteTweetId = 'quote';
      },
    },
    {
      name: 'thread format',
      change: (f) => {
        f.post.format = PostFormat.THREAD;
      },
    },
    {
      name: 'private',
      change: (f) => {
        f.post.visibility = PostVisibility.PRIVATE;
      },
    },
    {
      name: 'unlisted',
      change: (f) => {
        f.post.visibility = PostVisibility.UNLISTED;
      },
    },
    {
      name: 'publishing',
      change: (f) => {
        f.post.targetExecutionState = TargetExecutionState.PUBLISHING;
      },
    },
    {
      name: 'legacy status',
      change: (f) => {
        f.post.targetExecutionState = 'draft';
        Reflect.set(f.post, 'status', 'public');
      },
    },
    {
      name: 'empty text',
      change: (f) => {
        f.post.description = '';
      },
    },
    {
      name: 'oversize text',
      change: (f) => {
        f.post.description = 'x'.repeat(65537);
      },
    },
    {
      name: 'platform mismatch',
      change: (f) => {
        f.post.platform = Platform.FACEBOOK;
      },
    },
    {
      name: 'unsupported source',
      change: (f) => {
        f.post.platform = Platform.YOUTUBE;
        f.credential.platform = 'YOUTUBE';
      },
    },
  ];
  it.each(unsupported)('T5 fails closed on $name', async ({ change }) => {
    const f = await fixture();
    change(f);
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).toBeNull();
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it('T5 accepts POST and exactly 65536 UTF16 description units', async () => {
    const f = await fixture();
    f.post.category = PostCategory.POST;
    f.post.description = 'x'.repeat(65536);
    f.mint();
    expect(
      await loadLearningPublicationAssociationV1(f.tx, 'org', 'post'),
    ).not.toBeNull();
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).not.toBeNull();
  });
  it('T6 enforces the complete approved pin at mint, but resolves unchanged published content after maintenance', async () => {
    const f = await fixture();
    const before = await resolveLearningPublicationSourceV1(
      f.tx,
      'org',
      'post',
    );
    f.post.label = 'maintenance';
    f.post.scheduledDate = observed;
    f.post.isRepeat = true;
    f.post.repeatInterval = 2;
    f.post.repeatDaysOfWeek = [1, 3];
    expect(
      await loadLearningPublicationAssociationV1(f.tx, 'org', 'post'),
    ).toBeNull();
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).toEqual(before);
    Reflect.set(f.finalization, 'attempts', 999);
    Reflect.set(f.finalization, 'completedAt', observed);
    Reflect.set(f.finalization, 'source', 'maintenance');
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).toEqual(before);
    f.post.description = 'changed';
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).toBeNull();
  });
  it('T6 includes empty children in the true mint digest and binds exact publication target/time', async () => {
    const f = await fixture();
    const withoutChildren = buildArtifactContentDigest(
      projectPostArtifactMaterial(
        readArtifactRecord({ ...f.post, ingredients: [] }),
      ),
    );
    expect(withoutChildren).not.toBe(f.pin.contentDigest);
    f.pin.contentDigest = withoutChildren;
    expect(
      await loadLearningPublicationAssociationV1(f.tx, 'org', 'post'),
    ).toBeNull();
    for (const field of ['externalId', 'publishedAt']) {
      const next = await fixture();
      if (field === 'externalId') next.post.externalId = 'other';
      else next.post.publishedAt = new Date(published.getTime() + 1);
      expect(
        await resolveLearningPublicationSourceV1(next.tx, 'org', 'post'),
      ).toBeNull();
    }
  });
  it('T6 refuses missing/legacy/forged finalization association and unsuccessful/provider-draft results', async () => {
    const patches: Prisma.JsonObject[] = [
      { learningPublication: null },
      { learningPublication: {} },
      {
        learningPublication: {
          ...association({ approvalOperationId: 'forged' }),
        },
      },
      { success: false },
      { isProviderDraft: true },
      { executionState: 'publishing' },
      { platform: 'facebook' },
      { externalId: 'other' },
    ];
    for (const patch of patches) {
      const f = await fixture();
      f.finalization.result = {
        success: true,
        isProviderDraft: false,
        executionState: 'published',
        platform: 'twitter',
        externalId: 'external',
        learningPublication: { ...f.input },
        ...patch,
      };
      expect(
        await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
      ).toBeNull();
      expect(f.blocked).not.toHaveBeenCalled();
    }
    const missing = await fixture();
    missing.state.finalization = null;
    expect(
      await resolveLearningPublicationSourceV1(missing.tx, 'org', 'post'),
    ).toBeNull();
    const legacy = await fixture();
    legacy.finalization.result = {
      success: true,
      executionState: 'published',
      platform: 'twitter',
      externalId: 'external',
    };
    expect(
      await resolveLearningPublicationSourceV1(legacy.tx, 'org', 'post'),
    ).toBeNull();
  });
});

describe('current physical checkpoint and bounded source closure', () => {
  it('T5 counts deleted-but-still-linked ingredients and rejects their contradictory material', async () => {
    const f = await fixture();
    expect(learningPublicationPostSelect._count.select.ingredients).toBe(true);
    expect(learningPublicationPostSelect._count.select.children).toEqual({
      where: { isDeleted: false },
    });
    Reflect.set(f.post, 'ingredients', [
      { id: 'deleted-linked', isDeleted: true },
    ]);
    f.post._count.ingredients = 1;
    expect(
      await resolveLearningPublicationSourceV1(f.tx, 'org', 'post'),
    ).toBeNull();
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it('T7 exposes exact eight ordered refs without fake revision/account fields', async () => {
    const f = await fixture();
    expect(learningPublicationDependencyRefsV1(f.resolved)).toEqual([
      {
        kind: 'organization',
        id: 'org',
        organizationId: 'org',
        version: 'org',
      },
      { kind: 'brand', id: 'brand', organizationId: 'org', version: 'brand' },
      {
        kind: 'credential',
        id: 'credential',
        organizationId: 'org',
        version: 'credential',
      },
      {
        kind: 'post',
        id: 'post',
        organizationId: 'org',
        version: f.input.postSourceVersion,
      },
      {
        kind: 'post_publish_finalization',
        id: 'finalization',
        organizationId: 'org',
        version: f.resolved.finalizationVersion,
      },
      {
        kind: 'publish_approval',
        id: 'approval',
        organizationId: 'org',
        version: f.resolved.approvalVersion,
      },
      {
        kind: 'content_version_pin',
        id: 'pin',
        organizationId: 'org',
        version: f.pin.contentDigest,
      },
      {
        kind: 'config',
        id: 'rl-reward-v1-experimental',
        organizationId: null,
        version: 'rl-reward-v1-experimental',
      },
    ]);
    expect(
      await validLearningCheckpointPublicationV1(
        f.tx,
        structuredClone(f.checkpoint),
      ),
    ).toBe(true);
    expect(f.trace).toEqual([
      'checkpoint',
      'post',
      'organization',
      'brand',
      'credential',
      'approval',
      'pin',
      'finalization',
      'edges',
      'ancestry',
      'ancestry',
      'checkpoint',
    ]);
    expect(
      f.delegates.contentLearningCheckpoint.findFirst,
    ).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'checkpoint',
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        postId: 'post',
        isDeleted: false,
      },
    });
    expect(
      f.delegates.contentLearningCheckpoint.findFirst,
    ).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'checkpoint',
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        postId: 'post',
        isDeleted: false,
      },
    });
    expect(
      JSON.stringify(
        f.delegates.contentLearningCheckpoint.findFirst.mock.calls,
      ),
    ).not.toContain('accountId');
    expect(
      JSON.stringify(f.delegates.contentLearningDependency.findMany.mock.calls),
    ).not.toContain('derivedVersion');
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it('T7 rejects malformed candidate identities, revisions and dates before DB work', async () => {
    for (const value of [-1, 0.5, NaN, Infinity, 2147483648]) {
      const f = await fixture();
      const candidate = structuredClone(f.checkpoint);
      candidate.revision = value;
      expect(await validLearningCheckpointPublicationV1(f.tx, candidate)).toBe(
        false,
      );
      expect(f.trace).toEqual([]);
    }
    for (const key of [
      'id',
      'organizationId',
      'brandId',
      'credentialId',
      'postId',
    ]) {
      const f = await fixture();
      const candidate = structuredClone(f.checkpoint);
      Reflect.set(candidate, key, null);
      expect(await validLearningCheckpointPublicationV1(f.tx, candidate)).toBe(
        false,
      );
      expect(f.trace).toEqual([]);
    }
    for (const key of [
      'publishedAt',
      'dueAt',
      'requestStartedAt',
      'receivedAt',
      'providerAsOf',
    ]) {
      const f = await fixture();
      const candidate = structuredClone(f.checkpoint);
      Reflect.set(candidate, key, new Date(NaN));
      expect(await validLearningCheckpointPublicationV1(f.tx, candidate)).toBe(
        false,
      );
      expect(f.trace).toEqual([]);
    }
  });
  it('T7 rejects stale caller revision and missing/changed authoritative row while edges remain', async () => {
    const stale = await fixture();
    const candidate = structuredClone(stale.checkpoint);
    candidate.revision++;
    expect(
      await validLearningCheckpointPublicationV1(stale.tx, candidate),
    ).toBe(false);
    for (const change of [
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.checkpoint.revision++;
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.checkpoint.validity = 'invalid_source';
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.checkpoint.sourceFingerprint = 'different';
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.state.checkpoint = null;
      },
    ]) {
      const f = await fixture();
      const snapshot = structuredClone(f.checkpoint);
      change(f);
      expect(await validLearningCheckpointPublicationV1(f.tx, snapshot)).toBe(
        false,
      );
      expect(f.edges).toHaveLength(8);
    }
  });
  it('T7 rejects forged caller physical measurements/provenance/source/date and accepts only bookkeeping drift', async () => {
    const patches: Array<Partial<ContentLearningCheckpoint>> = [
      {
        measurement: {
          collection: { version: 1, outcome: 'observed', reasonCode: null },
          measurement: { exposure: 999 },
        },
      },
      {
        organicProvenance: {
          isPaid: false,
          isPinned: false,
          source: 'invented',
        },
      },
      { sourceFingerprint: 'invented' },
      { sourceAnalyticsId: 'invented' },
      { sourceAttemptId: 'invented' },
      { supersedesId: 'invented' },
      { attestation: { invented: true } },
      { publishedAt: new Date(published.getTime() + 1) },
      { requestStartedAt: new Date(observed.getTime() + 1) },
      { receivedAt: new Date(observed.getTime() + 1) },
      { dueAt: new Date(observed.getTime() + 1) },
      { providerAsOf: observed },
    ];
    for (const patch of patches) {
      const f = await fixture();
      const candidate = { ...structuredClone(f.checkpoint), ...patch };
      expect(await validLearningCheckpointPublicationV1(f.tx, candidate)).toBe(
        false,
      );
    }
    const f = await fixture();
    const candidate = structuredClone(f.checkpoint);
    candidate.createdAt = published;
    candidate.updatedAt = published;
    candidate.organicProvenance = {
      source: 'provider',
      isPinned: false,
      isPaid: false,
    };
    Reflect.set(f, 'accountEpoch', 99);
    expect(await validLearningCheckpointPublicationV1(f.tx, candidate)).toBe(
      true,
    );
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    'T8 rejects missing expected source edge %i',
    async (index) => {
      const f = await fixture();
      f.edges.splice(index, 1);
      expect(
        await validLearningCheckpointPublicationV1(
          f.tx,
          structuredClone(f.checkpoint),
        ),
      ).toBe(false);
    },
  );
  const invalidEdges: Array<{
    name: string;
    change: (f: Awaited<ReturnType<typeof fixture>>) => void;
  }> = [
    {
      name: 'ninth',
      change: (f) => {
        f.edges.push({ ...f.edges[0], id: 'ninth' });
      },
    },
    {
      name: 'duplicate',
      change: (f) => {
        f.edges[1] = { ...f.edges[0], id: 'duplicate' };
      },
    },
    {
      name: 'conflicting version',
      change: (f) => {
        f.edges[0].sourceVersion = 'conflict';
      },
    },
    {
      name: 'foreign derived tenant',
      change: (f) => {
        f.edges[0].derivedOrganizationId = 'foreign';
      },
    },
    {
      name: 'foreign source tenant',
      change: (f) => {
        f.edges[0].sourceOrganizationId = 'foreign';
      },
    },
    {
      name: 'invalid',
      change: (f) => {
        f.edges[0].valid = false;
      },
    },
    {
      name: 'softdeleted',
      change: (f) => {
        f.edges[0].isDeleted = true;
      },
    },
    {
      name: 'stale post',
      change: (f) => {
        f.edges[3].sourceVersion = 'old';
      },
    },
    {
      name: 'stale finalization',
      change: (f) => {
        f.edges[4].sourceVersion = 'old';
      },
    },
    {
      name: 'stale approval',
      change: (f) => {
        f.edges[5].sourceVersion = 'old';
      },
    },
    {
      name: 'stale pin',
      change: (f) => {
        f.edges[6].sourceVersion = 'old';
      },
    },
    {
      name: 'obsolete config',
      change: (f) => {
        f.edges[7].sourceId = 'old-config';
        f.edges[7].sourceVersion = 'old-config';
      },
    },
    {
      name: 'zero legacy edges',
      change: (f) => {
        f.edges.splice(0);
      },
    },
  ];
  it.each(invalidEdges)(
    'T8 refuses $name without backfill',
    async ({ change }) => {
      const f = await fixture();
      change(f);
      expect(
        await validLearningCheckpointPublicationV1(
          f.tx,
          structuredClone(f.checkpoint),
        ),
      ).toBe(false);
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  it.each(['scoped', 'config'])(
    'T8 rejects extra incoming leaf ancestry/cycles at %s scope',
    async (kind) => {
      const f = await fixture();
      f.ancestry.push({
        ...f.edges[0],
        id: 'cycle',
        sourceKind: 'checkpoint',
        sourceId: 'checkpoint',
        derivedKind: kind === 'config' ? 'config' : 'post',
        derivedId: kind === 'config' ? 'rl-reward-v1-experimental' : 'post',
        derivedOrganizationId: kind === 'config' ? null : 'org',
      });
      expect(
        await validLearningCheckpointPublicationV1(
          f.tx,
          structuredClone(f.checkpoint),
        ),
      ).toBe(false);
    },
  );
  it('T8 fixes take9 and the two scoped take1 leaf queries', async () => {
    const f = await fixture();
    expect(
      await validLearningCheckpointPublicationV1(
        f.tx,
        structuredClone(f.checkpoint),
      ),
    ).toBe(true);
    expect(f.delegates.contentLearningDependency.findMany.mock.calls).toEqual([
      [
        {
          where: {
            derivedKind: 'checkpoint',
            derivedId: 'checkpoint',
            derivedOrganizationId: 'org',
            isDeleted: false,
          },
          orderBy: { id: 'asc' },
          take: 9,
        },
      ],
      [
        {
          where: {
            derivedOrganizationId: 'org',
            isDeleted: false,
            OR: [
              { derivedKind: 'organization', derivedId: 'org' },
              { derivedKind: 'brand', derivedId: 'brand' },
              { derivedKind: 'credential', derivedId: 'credential' },
              { derivedKind: 'post', derivedId: 'post' },
              {
                derivedKind: 'post_publish_finalization',
                derivedId: 'finalization',
              },
              { derivedKind: 'publish_approval', derivedId: 'approval' },
              { derivedKind: 'content_version_pin', derivedId: 'pin' },
            ],
          },
          take: 1,
        },
      ],
      [
        {
          where: {
            derivedKind: 'config',
            derivedId: 'rl-reward-v1-experimental',
            derivedOrganizationId: null,
            isDeleted: false,
          },
          take: 1,
        },
      ],
    ]);
  });
  const timeCases: Array<{
    name: string;
    request: number;
    received: number;
    provider?: number;
    valid: boolean;
  }> = [
    { name: '48h', request: 48 * 3600000, received: 48 * 3600000, valid: true },
    { name: '49h', request: 49 * 3600000, received: 49 * 3600000, valid: true },
    {
      name: '120000ms duration',
      request: 48 * 3600000,
      received: 48 * 3600000 + 120000,
      valid: true,
    },
    {
      name: 'early request',
      request: 48 * 3600000 - 1,
      received: 48 * 3600000,
      valid: false,
    },
    {
      name: 'late receipt',
      request: 49 * 3600000,
      received: 49 * 3600000 + 1,
      valid: false,
    },
    {
      name: 'long collection',
      request: 48 * 3600000,
      received: 48 * 3600000 + 120001,
      valid: false,
    },
    {
      name: 'negative duration',
      request: 48 * 3600000 + 1,
      received: 48 * 3600000,
      valid: false,
    },
    {
      name: 'provider age1h',
      request: 48 * 3600000,
      received: 48 * 3600000,
      provider: 47 * 3600000,
      valid: true,
    },
    {
      name: 'provider too old',
      request: 48 * 3600000,
      received: 48 * 3600000,
      provider: 47 * 3600000 - 1,
      valid: false,
    },
    {
      name: 'provider future',
      request: 48 * 3600000,
      received: 48 * 3600000,
      provider: 48 * 3600000 + 1,
      valid: false,
    },
  ];
  it.each(timeCases)(
    'T9 preserves factual timing boundary $name',
    async (row) => {
      const f = await fixture();
      f.checkpoint.requestStartedAt = new Date(
        published.getTime() + row.request,
      );
      f.checkpoint.receivedAt = new Date(published.getTime() + row.received);
      f.checkpoint.providerAsOf =
        row.provider === undefined
          ? null
          : new Date(published.getTime() + row.provider);
      expect(
        await validLearningCheckpointPublicationV1(
          f.tx,
          structuredClone(f.checkpoint),
        ),
      ).toBe(row.valid);
    },
  );
  it('T9 rejects invalid/exact-due-date drift, terminal/unknown/paid/pinned observations', async () => {
    const cases: Array<Partial<ContentLearningCheckpoint>> = [
      { dueAt: new Date(observed.getTime() + 1) },
      { receivedAt: new Date(NaN) },
      { providerAsOf: new Date(NaN) },
      {
        measurement: {
          collection: {
            version: 1,
            outcome: 'terminal',
            reasonCode: 'missed_window',
          },
        },
      },
      {
        measurement: {
          collection: { version: 2, outcome: 'observed', reasonCode: null },
        },
      },
      { measurement: { collection: { version: 1, outcome: 'observed' } } },
      { measurement: {} },
      {
        organicProvenance: {
          isPaid: null,
          isPinned: false,
          source: 'provider',
        },
      },
      {
        organicProvenance: {
          isPaid: true,
          isPinned: false,
          source: 'provider',
        },
      },
      {
        organicProvenance: {
          isPaid: false,
          isPinned: true,
          source: 'provider',
        },
      },
      {
        organicProvenance: {
          isPaid: false,
          isPinned: false,
          source: 'unknown',
        },
      },
    ];
    for (const patch of cases) {
      const f = await fixture();
      Object.assign(f.checkpoint, patch);
      expect(
        await validLearningCheckpointPublicationV1(
          f.tx,
          structuredClone(f.checkpoint),
        ),
      ).toBe(false);
    }
  });
  it('T9 allows historical facts without a wall-clock/account-policy age read', async () => {
    const f = await fixture();
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(new Date('2027-10-01').getTime());
      expect(
        await validLearningCheckpointPublicationV1(
          f.tx,
          structuredClone(f.checkpoint),
        ),
      ).toBe(true);
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });
  it('T10 rejects missing or changed final checkpoint reread after positive source/edge checks', async () => {
    const missing = await fixture();
    missing.delegates.contentLearningCheckpoint.findFirst
      .mockResolvedValueOnce(structuredClone(missing.checkpoint))
      .mockResolvedValueOnce(null);
    expect(
      await validLearningCheckpointPublicationV1(
        missing.tx,
        structuredClone(missing.checkpoint),
      ),
    ).toBe(false);
    const changed = await fixture();
    const candidate = structuredClone(changed.checkpoint);
    changed.delegates.contentLearningDependency.findMany.mockImplementation(
      async (
        args: Prisma.ContentLearningDependencyFindManyArgs,
      ): Promise<ContentLearningDependency[]> => {
        if (args.take === 9) return structuredClone(changed.edges);
        if (args.where?.derivedKind === 'config')
          changed.checkpoint.measurement = {
            collection: { version: 1, outcome: 'observed', reasonCode: null },
            measurement: { exposure: 9000, weightedActions: 10 },
          };
        return [];
      },
    );
    expect(
      await validLearningCheckpointPublicationV1(changed.tx, candidate),
    ).toBe(false);
    expect(changed.blocked).not.toHaveBeenCalled();
  });
  it('T10 propagates current context and dependency failures unchanged without writes/locks', async () => {
    const context = await fixture();
    const error = new Error('source read');
    context.delegates.brand.findFirst.mockRejectedValue(error);
    await expect(
      resolveLearningPublicationSourceV1(context.tx, 'org', 'post'),
    ).rejects.toBe(error);
    expect(context.blocked).not.toHaveBeenCalled();
    const graph = await fixture();
    const graphError = new Error('edge read');
    graph.delegates.contentLearningDependency.findMany.mockRejectedValue(
      graphError,
    );
    await expect(
      validLearningCheckpointPublicationV1(
        graph.tx,
        structuredClone(graph.checkpoint),
      ),
    ).rejects.toBe(graphError);
    expect(graph.blocked).not.toHaveBeenCalled();
  });
});

describe('C1 real dependency publication consumers', () => {
  it('resolves exact Post, approval and finalization versions from the current same-client publication proof', async () => {
    const f = await fixture();
    const service = new LearningDependencyService(f.tx);
    for (const [kind, id, version] of [
      ['post', f.post.id, f.resolved.postSourceVersion],
      ['publish_approval', f.approval.id, f.resolved.approvalVersion],
      [
        'post_publish_finalization',
        f.finalization.id,
        f.resolved.finalizationVersion,
      ],
    ] as const) {
      expect(await service.resolve(kind, id, 'org', f.tx)).toEqual({
        kind,
        id,
        organizationId: 'org',
        version,
      });
    }
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it('preserves current versions across bookkeeping but rejects changed physical content and weak legacy versions', async () => {
    const f = await fixture();
    const service = new LearningDependencyService(f.tx);
    f.post.label = 'maintenance';
    f.post.scheduledDate = new Date('2026-12-01');
    expect((await service.resolve('post', 'post', 'org', f.tx)).version).toBe(
      f.resolved.postSourceVersion,
    );
    Object.assign(f.finalization, {
      completedAt: new Date(),
      source: 'maintenance',
    });
    expect(
      (
        await service.resolve(
          'post_publish_finalization',
          'finalization',
          'org',
          f.tx,
        )
      ).version,
    ).toBe(f.resolved.finalizationVersion);
    f.post.description += ' changed';
    await expect(service.resolve('post', 'post', 'org', f.tx)).rejects.toThrow(
      'Pinned dependency identity unavailable',
    );
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it.each([
    'approved',
    'executing',
    'revoked',
    'disconnected',
    'inactive',
    'deleted-org',
    'legacy',
  ])(
    'fails closed for %s source authority without writes',
    async (mutation) => {
      const f = await fixture();
      const service = new LearningDependencyService(f.tx);
      if (mutation === 'approved')
        f.approval.status = PublishApprovalStatus.APPROVED;
      if (mutation === 'executing')
        f.approval.status = PublishApprovalStatus.EXECUTING;
      if (mutation === 'revoked') f.approval.invalidatedAt = new Date();
      if (mutation === 'disconnected') f.credential.isConnected = false;
      if (mutation === 'inactive') f.brand.isActive = false;
      if (mutation === 'deleted-org') f.organization.isDeleted = true;
      if (mutation === 'legacy') f.finalization.result = { success: true };
      for (const [kind, id] of [
        ['post', 'post'],
        ['publish_approval', 'approval'],
        ['post_publish_finalization', 'finalization'],
      ] as const)
        await expect(service.resolve(kind, id, 'org', f.tx)).rejects.toThrow(
          'Pinned dependency identity unavailable',
        );
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  it('requires live current parents for private brand and connected credential leaves', async () => {
    const f = await fixture();
    const service = new LearningDependencyService(f.tx);
    expect((await service.resolve('brand', 'brand', 'org', f.tx)).version).toBe(
      'brand',
    );
    expect(
      (await service.resolve('credential', 'credential', 'org', f.tx)).version,
    ).toBe('credential');
    f.brand.isActive = false;
    await expect(
      service.resolve('brand', 'brand', 'org', f.tx),
    ).rejects.toThrow();
    await expect(
      service.resolve('credential', 'credential', 'org', f.tx),
    ).rejects.toThrow();
  });
});

describe('C3 actual analytics preparation with real current publication proof', () => {
  it('returns only exact six-field authority and propagates source database failure', async () => {
    const f = await fixture();
    const module = await Test.createTestingModule({
      providers: [
        { provide: PostsService, useValue: {} },
        { provide: OutliersService, useValue: {} },
        { provide: LoggerService, useValue: {} },
        { provide: LearningCheckpointService, useValue: {} },
        { provide: WorkflowExecutionQueueService, useValue: {} },
      ],
    }).compile();
    const service = new PostAnalyticsService(
      f.tx,
      module.get<LoggerService>(LoggerService),
      module.get<PostsService>(PostsService),
      module.get<OutliersService>(OutliersService),
      module.get<LearningCheckpointService>(LearningCheckpointService),
      module.get<WorkflowExecutionQueueService>(WorkflowExecutionQueueService),
    );
    const input = {
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      postId: 'post',
      platform: Platform.TWITTER,
      externalId: 'external',
    };
    expect(await service.prepareLearningObservation(input)).toEqual(f.resolved);
    for (const key of [
      'organizationId',
      'brandId',
      'credentialId',
      'postId',
      'externalId',
    ] as const)
      expect(
        await service.prepareLearningObservation({ ...input, [key]: 'other' }),
      ).toBeNull();
    expect(
      await service.prepareLearningObservation({
        ...input,
        platform: Platform.FACEBOOK,
      }),
    ).toBeNull();
    f.post.category = PostCategory.IMAGE;
    expect(await service.prepareLearningObservation(input)).toBeNull();
    f.post.category = PostCategory.TEXT;
    const error = new Error('source database');
    f.delegates.post.findFirst.mockRejectedValueOnce(error);
    await expect(service.prepareLearningObservation(input)).rejects.toBe(error);
    expect(f.blocked).not.toHaveBeenCalled();
  });
});
