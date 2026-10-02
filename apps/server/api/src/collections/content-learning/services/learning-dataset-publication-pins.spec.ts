import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import { LearningDatasetPublicationPins } from '@api/collections/content-learning/services/learning-dataset-publication-pins';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  loadLearningPublicationAssociationV1,
  resolveLearningPublicationSourceV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import {
  parseLearningPublicationSourceV1,
  projectAssociation,
  projectLearningPublicationContextV1,
} from '@api/collections/content-learning/services/learning-publication-source.projection';
import type {
  LearningPublicationApprovalRow,
  LearningPublicationBrandRow,
  LearningPublicationCredentialRow,
  LearningPublicationFinalizationRow,
  LearningPublicationOrganizationRow,
  LearningPublicationPinRow,
  LearningPublicationPostRow,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const published = new Date('2026-10-01T00:00:00.000Z');
function fixture(index = 0) {
  const postId = `post-${index}`;
  const post: LearningPublicationPostRow = {
    id: postId,
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
    publishApprovalId: `approval-${index}`,
    reviewVersionPinId: `pin-${index}`,
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
    id: `approval-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    postId,
    artifactVersionPinId: `pin-${index}`,
    operationId: 'operation',
    status: PublishApprovalStatus.PUBLISHED,
    invalidatedAt: null,
    scopeDigest: 'actual scope digest',
  };
  const pin: LearningPublicationPinRow = {
    id: `pin-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    recordKind: 'post',
    recordId: postId,
    contentDigest: 'pending',
  };
  const finalization: LearningPublicationFinalizationRow = {
    id: `finalization-${index}`,
    organizationId: 'org',
    postId,
    result: {},
  };

  pin.contentDigest = buildArtifactContentDigest({
    ...projectPostArtifactMaterial(
      readArtifactRecord({ ...post, ingredients: [] }),
    ),
    children: [],
  });
  const context = projectLearningPublicationContextV1('org', postId, {
    post,
    organization,
    brand,
    credential,
    approval,
    pin,
  });
  if (!context) throw new Error('Invalid canonical fixture context');
  const association = projectAssociation(context);
  if (!association) throw new Error('Invalid canonical fixture association');
  finalization.result = {
    success: true,
    isProviderDraft: false,
    executionState: TargetExecutionState.PUBLISHED,
    platform: post.platform,
    externalId: post.externalId,
    learningPublication: { ...association },
  };
  return { post, organization, brand, credential, approval, pin, finalization };
}
type Rows = ReturnType<typeof fixture>;
type ReadArgs = {
  where?: {
    id?: string | { in: string[] };
    postId?: string | { in: string[] };
    organizationId?: string;
  };
};
function delegates(rows: Rows[]) {
  const receipt: { model: string; size: number; method: string }[] = [];
  const models = {
    post: rows.map((row) => row.post),
    organization: rows.map((row) => row.organization),
    brand: rows.map((row) => row.brand),
    credential: rows.map((row) => row.credential),
    publishApproval: rows.map((row) => row.approval),
    contentVersionPin: rows.map((row) => row.pin),
    postPublishFinalization: rows.map((row) => row.finalization),
  };
  const delegate = <T extends { id: string }>(model: string, values: T[]) => {
    const distinct = [
      ...new Map(values.map((value) => [value.id, value])).values(),
    ];
    const select = (args: ReadArgs) =>
      distinct.filter((value) => {
        const field = args.where?.id ?? args.where?.postId;
        const valueId = args.where?.id
          ? value.id
          : 'postId' in value
            ? value.postId
            : value.id;
        return typeof field === 'string'
          ? field === valueId
          : (field?.in.includes(String(valueId)) ?? true);
      });
    return {
      findMany: vi.fn(async (args: ReadArgs) => {
        const field = args.where?.id ?? args.where?.postId;
        receipt.push({
          model,
          method: 'findMany',
          size: typeof field === 'object' ? field.in.length : 1,
        });
        return select(args);
      }),
      findFirst: vi.fn(async (args: ReadArgs) => {
        receipt.push({ model, method: 'findFirst', size: 1 });
        return select(args)[0] ?? null;
      }),
    };
  };
  const tx = {
    post: delegate('post', models.post),
    organization: delegate('organization', models.organization),
    brand: delegate('brand', models.brand),
    credential: delegate('credential', models.credential),
    publishApproval: delegate('publishApproval', models.publishApproval),
    contentVersionPin: delegate('contentVersionPin', models.contentVersionPin),
    postPublishFinalization: delegate(
      'postPublishFinalization',
      models.postPublishFinalization,
    ),
  };
  return { tx: tx as unknown as Prisma.TransactionClient, receipt, raw: tx };
}
function expected(row: Rows) {
  const post = row.post;
  const publishedAt = published.toISOString();
  const postVersion = learningHash([
    'learning-publication-post-v1',
    'org',
    'brand',
    'credential',
    post.id,
    post.platform,
    post.externalId,
    publishedAt,
    'text',
    post.description,
  ]);
  const finalizationVersion = learningHash([
    'learning-publication-finalization-v1',
    1,
    'org',
    'brand',
    'credential',
    post.id,
    row.approval.id,
    row.approval.operationId,
    row.pin.id,
    post.platform,
    post.externalId,
    publishedAt,
    row.pin.contentDigest,
    postVersion,
  ]);
  const approvalVersion = learningHash([
    'learning-publication-approval-v1',
    'org',
    'brand',
    post.id,
    row.approval.id,
    row.approval.operationId,
    row.pin.id,
    row.pin.contentDigest,
    row.approval.scopeDigest,
  ]);
  return {
    post: [post.id, postVersion],
    publish_approval: [row.approval.id, approvalVersion],
    post_publish_finalization: [row.finalization.id, finalizationVersion],
  } as const;
}

describe('batched current publication pins', () => {
  it.each([null, '', '   '])(
    'rejects missing credential brand %j in both parent pin readers',
    async (brandId) => {
      const row = fixture();
      row.credential.brandId = brandId;
      const { tx, raw } = delegates([row]);
      const bulk = new LearningDatasetPublicationPins(tx, 1000);
      expect(await bulk.pins('credential', ['credential'], 'org')).toEqual(
        new Map(),
      );
      expect(raw.brand.findMany).not.toHaveBeenCalled();
      const scalar = new LearningDependencyService(
        tx as unknown as PrismaService,
      );
      await expect(
        scalar.resolve('credential', 'credential', 'org', tx),
      ).rejects.toThrow('Pinned dependency identity unavailable');
      expect(raw.brand.findFirst).not.toHaveBeenCalled();
      expect(await bulk.pins('credential', ['credential'], 'org')).toEqual(
        new Map(),
      );
      expect(raw.credential.findMany).toHaveBeenCalledTimes(1);
    },
  );

  for (const first of [
    'post',
    'publish_approval',
    'post_publish_finalization',
  ] as const) {
    it(`splits 1001 sources and reuses all current pins after ${first} entry`, async () => {
      const rows = Array.from({ length: 1001 }, (_, index) => fixture(index));
      const { tx, receipt } = delegates(rows);
      const pins = new LearningDatasetPublicationPins(tx, 1000);
      const wanted = rows.map((row) => expected(row)[first][0]);
      expect(await pins.pins(first, [...wanted, wanted[0]], 'org')).toEqual(
        new Map(rows.map((row) => expected(row)[first])),
      );
      const readCount = receipt.length;
      for (const kind of [
        'post',
        'publish_approval',
        'post_publish_finalization',
      ] as const)
        expect(
          await pins.pins(
            kind,
            rows.map((row) => expected(row)[kind][0]),
            'org',
          ),
        ).toEqual(new Map(rows.map((row) => expected(row)[kind])));
      expect(receipt).toHaveLength(readCount);
      expect(
        receipt.filter((row) => row.model === 'post').map((row) => row.size),
      ).toEqual([1000, 1]);
      expect(
        receipt.every((row) => row.size <= 1000 && row.method === 'findMany'),
      ).toBe(true);
      expect(
        receipt.filter((row) => row.model === 'organization'),
      ).toHaveLength(1);
      expect(receipt.filter((row) => row.model === 'brand')).toHaveLength(1);
      expect(receipt.filter((row) => row.model === 'credential')).toHaveLength(
        1,
      );
      const cached = JSON.stringify(pins, (_key, value: unknown) =>
        value instanceof Map ? [...value.entries()] : value,
      );
      expect(cached).not.toContain('exact text');
      expect(cached).not.toContain('learningPublication');
    });
  }
  it('matches scalar and independent tuple hashes on supported text publications', async () => {
    for (const platform of [
      Platform.TWITTER,
      Platform.FACEBOOK,
      Platform.THREADS,
      Platform.LINKEDIN,
    ]) {
      for (const category of [PostCategory.TEXT, PostCategory.POST]) {
        const row = fixture();
        row.post.platform = platform;
        row.credential.platform =
          platform.toUpperCase() as Rows['credential']['platform'];
        row.post.category = category;
        row.post.description = ' Ω\r\n東京  ';
        row.pin.contentDigest = buildArtifactContentDigest({
          ...projectPostArtifactMaterial(
            readArtifactRecord({ ...row.post, ingredients: [] }),
          ),
          children: [],
        });
        const context = projectLearningPublicationContextV1(
          'org',
          row.post.id,
          row,
        );
        if (!context) throw new Error('Missing context');
        row.finalization.result = {
          ...(row.finalization.result as Prisma.JsonObject),
          platform,
          learningPublication: { ...projectAssociation(context) },
        };
        const { tx } = delegates([row]);
        const source = await resolveLearningPublicationSourceV1(
          tx,
          'org',
          row.post.id,
        );
        expect(source?.postSourceVersion).toBe(expected(row).post[1]);
        const scalar = new LearningDependencyService(
          tx as unknown as PrismaService,
        );
        const bulk = new LearningDatasetPublicationPins(tx, 1000);
        for (const kind of [
          'post',
          'publish_approval',
          'post_publish_finalization',
        ] as const) {
          const [sourceId, version] = expected(row)[kind];
          expect(await scalar.resolve(kind, sourceId, 'org', tx)).toEqual({
            kind,
            id: sourceId,
            organizationId: 'org',
            version,
          });
          expect(await bulk.pins(kind, [sourceId], 'org')).toEqual(
            new Map([[sourceId, version]]),
          );
        }
      }
    }
  });
  const negatives: [string, (row: Rows) => void][] = [
    [
      'draft',
      (row) => {
        row.post.targetExecutionState = TargetExecutionState.DRAFT;
      },
    ],
    [
      'publishing',
      (row) => {
        row.post.targetExecutionState = TargetExecutionState.PUBLISHING;
      },
    ],
    [
      'private',
      (row) => {
        row.post.visibility = PostVisibility.PRIVATE;
      },
    ],
    [
      'null external ID',
      (row) => {
        row.post.externalId = null;
      },
    ],
    [
      'null published date',
      (row) => {
        row.post.publishedAt = null;
      },
    ],
    [
      'deleted ingredient still linked',
      (row) => {
        row.post._count.ingredients = 1;
      },
    ],
    [
      'live child',
      (row) => {
        row.post._count.children = 1;
      },
    ],
    [
      'thread parent',
      (row) => {
        row.post.parentId = 'parent';
      },
    ],
    [
      'attachment',
      (row) => {
        row.post.targetAttachments = ['attachment'];
      },
    ],
    [
      'quote',
      (row) => {
        row.post.quoteTweetId = 'quote';
      },
    ],
    [
      'article',
      (row) => {
        row.post.entityArticleId = 'article';
      },
    ],
    [
      'ingredient entity',
      (row) => {
        row.post.entityIngredientId = 'ingredient';
      },
    ],
    [
      'model entity',
      (row) => {
        row.post.entityModel = 'INGREDIENT';
      },
    ],
    [
      'foreign post',
      (row) => {
        row.post.organizationId = 'foreign';
      },
    ],
    [
      'wrong platform',
      (row) => {
        row.post.platform = Platform.LINKEDIN;
      },
    ],
    [
      'unsupported Mastodon',
      (row) => {
        row.post.platform = Platform.MASTODON;
        row.credential.platform = 'MASTODON';
      },
    ],
    [
      'disconnected credential',
      (row) => {
        row.credential.isConnected = false;
      },
    ],
    [
      'inactive brand',
      (row) => {
        row.brand.isActive = false;
      },
    ],
    [
      'deleted organization',
      (row) => {
        row.organization.isDeleted = true;
      },
    ],
    [
      'foreign brand',
      (row) => {
        row.brand.organizationId = 'foreign';
      },
    ],
    [
      'wrong credential brand',
      (row) => {
        row.credential.brandId = 'foreign';
      },
    ],
    [
      'foreign credential',
      (row) => {
        row.credential.organizationId = 'foreign';
      },
    ],
    [
      'approved',
      (row) => {
        row.approval.status = PublishApprovalStatus.APPROVED;
      },
    ],
    [
      'executing',
      (row) => {
        row.approval.status = PublishApprovalStatus.EXECUTING;
      },
    ],
    [
      'invalidated approval',
      (row) => {
        row.approval.invalidatedAt = published;
      },
    ],
    [
      'wrong approval pin',
      (row) => {
        row.approval.artifactVersionPinId = 'wrong';
      },
    ],
    [
      'foreign approval',
      (row) => {
        row.approval.organizationId = 'foreign';
      },
    ],
    [
      'wrong pin record',
      (row) => {
        row.pin.recordKind = 'article';
      },
    ],
    [
      'foreign pin',
      (row) => {
        row.pin.organizationId = 'foreign';
      },
    ],
    [
      'wrong pin brand',
      (row) => {
        row.pin.brandId = 'foreign';
      },
    ],
    [
      'malformed digest',
      (row) => {
        row.pin.contentDigest = 'legacy';
      },
    ],
    [
      'legacy finalization',
      (row) => {
        row.finalization.result = {};
      },
    ],
    [
      'failed finalization',
      (row) => {
        row.finalization.result = {
          ...(row.finalization.result as Prisma.JsonObject),
          success: false,
        };
      },
    ],
    [
      'draft finalization',
      (row) => {
        row.finalization.result = {
          ...(row.finalization.result as Prisma.JsonObject),
          isProviderDraft: true,
        };
      },
    ],
    [
      'foreign finalization',
      (row) => {
        row.finalization.organizationId = 'foreign';
      },
    ],
    [
      'wrong external ID',
      (row) => {
        row.finalization.result = {
          ...(row.finalization.result as Prisma.JsonObject),
          externalId: 'wrong',
        };
      },
    ],
    [
      'wrong final platform',
      (row) => {
        row.finalization.result = {
          ...(row.finalization.result as Prisma.JsonObject),
          platform: Platform.LINKEDIN,
        };
      },
    ],
  ];
  for (const [name, mutate] of negatives)
    it(`fails closed for ${name} in scalar and all bulk entry orders`, async () => {
      const row = fixture();
      mutate(row);
      const { tx } = delegates([row]);
      expect(
        await resolveLearningPublicationSourceV1(tx, 'org', row.post.id),
      ).toBeNull();
      for (const kind of [
        'post',
        'publish_approval',
        'post_publish_finalization',
      ] as const) {
        const pins = new LearningDatasetPublicationPins(tx, 1000);
        expect(await pins.pins(kind, [expected(row)[kind][0]], 'org')).toEqual(
          new Map(),
        );
      }
    });
  it('does not grant a current pin to noncurrent or absent identities and caches misses per tenant', async () => {
    const row = fixture();
    const { tx, receipt } = delegates([row]);
    const pins = new LearningDatasetPublicationPins(tx, 1000);
    expect(await pins.pins('publish_approval', ['old'], 'org')).toEqual(
      new Map(),
    );
    const count = receipt.length;
    await pins.pins('publish_approval', ['old'], 'org');
    expect(receipt).toHaveLength(count);
    expect(await pins.pins('post', [row.post.id], 'foreign')).toEqual(
      new Map(),
    );
    expect(await pins.pins('post', [row.post.id], 'org')).toEqual(
      new Map([expected(row).post]),
    );
  });
  it('keeps standalone digest authority independent of withdrawn publication parents', async () => {
    const row = fixture();
    row.organization.isDeleted = true;
    row.brand.isActive = false;
    row.pin.recordKind = 'article';
    row.pin.contentDigest = 'arbitrary-nonempty';
    const { tx } = delegates([row]);
    const pins = new LearningDatasetPublicationPins(tx, 1000);
    expect(await pins.pins('post', [row.post.id], 'org')).toEqual(new Map());
    expect(await pins.pins('content_version_pin', [row.pin.id], 'org')).toEqual(
      new Map([[row.pin.id, 'arbitrary-nonempty']]),
    );
    expect(
      await pins.pins('content_version_pin', [row.pin.id], 'foreign'),
    ).toEqual(new Map());
  });
  it('propagates transient errors without turning them into cached misses', async () => {
    const row = fixture();
    const { tx, raw } = delegates([row]);
    raw.post.findMany.mockRejectedValueOnce(new Error('transient'));
    const pins = new LearningDatasetPublicationPins(tx, 1000);
    await expect(pins.pins('post', [row.post.id], 'org')).rejects.toThrow(
      'transient',
    );
    expect(await pins.pins('post', [row.post.id], 'org')).toEqual(
      new Map([expected(row).post]),
    );
  });
  it('keeps current immutable facts valid after harmless material maintenance while mint rejects stale material', async () => {
    const row = fixture();
    row.post.label = 'maintained';
    row.post.isRepeat = true;
    row.post.scheduledDate = published;
    const { tx } = delegates([row]);
    const pins = new LearningDatasetPublicationPins(tx, 1000);
    expect(await pins.pins('post', [row.post.id], 'org')).toEqual(
      new Map([expected(row).post]),
    );
    expect(
      await loadLearningPublicationAssociationV1(tx, 'org', row.post.id),
    ).toBeNull();
  });
  it('rejects source extra keys, accessors and symbol fields', async () => {
    const row = fixture();
    const { tx } = delegates([row]);
    const source = await resolveLearningPublicationSourceV1(
      tx,
      'org',
      row.post.id,
    );
    expect(source).not.toBeNull();
    expect(
      parseLearningPublicationSourceV1({ ...source, extra: false }),
    ).toBeNull();
    expect(
      parseLearningPublicationSourceV1({ ...source, [Symbol('extra')]: 0 }),
    ).toBeNull();
    const accessor = { ...source };
    Object.defineProperty(accessor, 'postId', { get: () => row.post.id });
    expect(parseLearningPublicationSourceV1(accessor)).toBeNull();
  });
  it('validates independent parent leaves without enlarging publication platform authority', async () => {
    const row = fixture();
    row.credential.platform = 'YOUTUBE';
    row.post.platform = Platform.YOUTUBE;
    const { tx } = delegates([row]);
    const pins = new LearningDatasetPublicationPins(tx, 1000);
    expect(await pins.pins('organization', ['org', 'foreign'], 'org')).toEqual(
      new Map([['org', 'org']]),
    );
    expect(await pins.pins('brand', ['brand'], 'org')).toEqual(
      new Map([['brand', 'brand']]),
    );
    expect(await pins.pins('credential', ['credential'], 'org')).toEqual(
      new Map([['credential', 'credential']]),
    );
    expect(await pins.pins('post', [row.post.id], 'org')).toEqual(new Map());
  });
  it('rejects noncurrent approval mapping while filling only the actual current identities', async () => {
    const row = fixture(),
      older = fixture(1);
    older.post = row.post;
    older.approval.postId = row.post.id;
    const { tx } = delegates([row, older]);
    const pins = new LearningDatasetPublicationPins(tx, 1000);
    expect(
      await pins.pins('publish_approval', [older.approval.id], 'org'),
    ).toEqual(new Map());
    expect(
      await pins.pins('publish_approval', [row.approval.id], 'org'),
    ).toEqual(new Map([expected(row).publish_approval]));
  });
  it('rejects missing finalizations, unlisted posts, changed association fields and accessor authority', async () => {
    for (const changed of [
      'publishedAt',
      'postSourceVersion',
      'externalId',
      'accessor',
      'symbol',
      'missing',
      'unlisted',
    ] as const) {
      const row = fixture();
      const result = row.finalization.result as Prisma.JsonObject;
      const association = result.learningPublication as Prisma.JsonObject;
      if (changed === 'publishedAt')
        association.publishedAt = '2026-10-01T00:00:01.000Z';
      if (changed === 'postSourceVersion')
        association.postSourceVersion = 'c'.repeat(64);
      if (changed === 'externalId') association.externalId = 'foreign';
      if (changed === 'accessor')
        Object.defineProperty(association, 'externalId', {
          get: () => 'external',
        });
      if (changed === 'symbol')
        Object.defineProperty(association, Symbol('extra'), { value: false });
      if (changed === 'unlisted') row.post.visibility = PostVisibility.UNLISTED;
      const { tx, raw } = delegates([row]);
      if (changed === 'missing') {
        raw.postPublishFinalization.findMany.mockResolvedValue([]);
        raw.postPublishFinalization.findFirst.mockResolvedValue(null);
      }
      expect(
        await new LearningDatasetPublicationPins(tx, 1000).pins(
          'post',
          [row.post.id],
          'org',
        ),
        changed,
      ).toEqual(new Map());
      expect(
        await resolveLearningPublicationSourceV1(tx, 'org', row.post.id),
        changed,
      ).toBeNull();
    }
  });
  it('ignores finalization timestamps, labels and bookkeeping when factual association is unchanged', async () => {
    const row = fixture();
    Reflect.set(row.finalization, 'completedAt', new Date('2030-01-01'));
    Reflect.set(row.finalization, 'source', 'maintained');
    Reflect.set(row.finalization, 'attempts', 999);
    const { tx } = delegates([row]);
    expect(
      await new LearningDatasetPublicationPins(tx, 1000).pins(
        'post_publish_finalization',
        [row.finalization.id],
        'org',
      ),
    ).toEqual(new Map([expected(row).post_publish_finalization]));
  });
});
