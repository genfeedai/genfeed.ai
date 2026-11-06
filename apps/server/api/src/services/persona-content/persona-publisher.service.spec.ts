import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { PersonasService } from '@api/collections/personas/services/personas.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import {
  PersonaPublisherService,
  type PublishInput,
} from '@api/services/persona-content/persona-publisher.service';
import type { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import {
  AgentPublishDecision,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface ReviewRun {
  approvedItems: string[];
  id: string;
  idempotencyKey: string;
  items: Row[];
}

const INPUT: PublishInput = {
  brandId: 'brand-1',
  description: 'Draft caption',
  organizationId: 'org-1',
  personaId: 'persona-1',
  userId: 'user-1',
};

describe('PersonaPublisherService', () => {
  // The organization's personas, credentials and posts, the review runs
  // opened for them, and the modules the organization can use.
  let personas: Row[];
  let credentials: Row[];
  let posts: Row[];
  let reviews: ReviewRun[];
  let permittedPosts: Set<string>;
  let accessDenial: Error | undefined;
  let accessChecks: [string, string][];
  let failingPlatforms: Set<string>;
  let isReviewDown: boolean;
  let service: PersonaPublisherService;

  const seedPersona = (credentialIds: string[]) => {
    personas.push({
      credentials: credentialIds,
      id: 'persona-1',
      label: 'Persona',
      organizationId: 'org-1',
    });
  };
  const seedCredential = (id: string, platform: string, fields: Row = {}) => {
    credentials.push({
      brandId: 'brand-1',
      id,
      isDeleted: false,
      organizationId: 'org-1',
      platform,
      ...fields,
    });
  };
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  beforeEach(() => {
    personas = [];
    credentials = [];
    posts = [];
    reviews = [];
    permittedPosts = new Set();
    accessDenial = undefined;
    accessChecks = [];
    failingPlatforms = new Set();
    isReviewDown = false;

    service = new PersonaPublisherService(
      {
        error: () => undefined,
        log: () => undefined,
      } as unknown as LoggerService,
      {
        findOne: async (where: Row) =>
          personas.find((row) => matches(row, where)) ?? null,
      } as unknown as PersonasService,
      {
        findOneSelect: async (where: Row) => {
          const row = credentials.find((candidate) =>
            matches(candidate, where),
          );
          return row ? { platform: row.platform } : null;
        },
      } as unknown as CredentialsService,
      {
        create: async (data: Row) => {
          if (failingPlatforms.has(String(data.platform))) {
            throw new Error('DB error');
          }
          const row = { ...data, id: `post-${posts.length + 1}` };
          posts.push(row);
          return row;
        },
      } as unknown as PostsService,
      {
        approveAutonomousItems: async (runId: string, itemIds: string[]) => {
          reviews
            .find((run) => run.id === runId)
            ?.approvedItems.push(...itemIds);
        },
        createManualReviewTurboRun: async (
          dto: { items: Row[] },
          _userId: string,
          _organizationId: string,
          idempotencyKey: string,
        ) => {
          if (isReviewDown) throw new Error('Review unavailable');
          const run = {
            approvedItems: [],
            id: `run-${reviews.length + 1}`,
            idempotencyKey,
            items: dto.items.map((item, index) => ({
              ...item,
              id: `run-${reviews.length + 1}-item-${index + 1}`,
            })),
          };
          reviews.push(run);
          return run;
        },
      } as unknown as TurboRunService,
      {
        resolveForPost: async ({ postId }: { postId: string }) => ({
          result: {
            decision: permittedPosts.has(postId)
              ? AgentPublishDecision.PERMITTED
              : AgentPublishDecision.DENIED,
          },
        }),
      } as unknown as AutonomousPublishPolicyService,
      {
        assertAccess: async (organizationId: string, moduleId: string) => {
          accessChecks.push([organizationId, moduleId]);
          if (accessDenial) throw accessDenial;
        },
      } as unknown as OrganizationModuleAccessService,
    );
  });

  it.each([
    ['unreleased', 'ORGANIZATION_MODULE_UNRELEASED', HttpStatus.FORBIDDEN],
    [
      'unavailable',
      'ORGANIZATION_MODULE_UNAVAILABLE',
      HttpStatus.SERVICE_UNAVAILABLE,
    ],
  ])(
    'rejects %s publishing access before any publication effect',
    async (_reason, code, status) => {
      seedPersona(['credential-1']);
      seedCredential('credential-1', 'INSTAGRAM');
      accessDenial = new HttpException(
        { code, moduleId: 'publishing' },
        status,
      );

      await expect(service.publishToAll(INPUT)).rejects.toBe(accessDenial);
      expect(accessChecks).toEqual([['org-1', 'publishing']]);
      expect(posts).toEqual([]);
      expect(reviews).toEqual([]);
    },
  );

  it('rechecks module access on the next publication attempt', async () => {
    seedPersona(['credential-1']);
    seedCredential('credential-1', 'INSTAGRAM');
    await service.publishToAll(INPUT);
    accessDenial = new Error('Publishing disabled after the prior attempt');

    await expect(service.publishToAll(INPUT)).rejects.toBe(accessDenial);
    expect(accessChecks).toHaveLength(2);
    expect(posts).toHaveLength(1);
  });

  it('creates a public draft per credential and opens a manual review for it', async () => {
    seedPersona(['credential-1']);
    seedCredential('credential-1', 'INSTAGRAM');
    const scheduledDate = new Date('2026-12-31T00:00:00.000Z');

    const result = await service.publishToAll({
      ...INPUT,
      ingredientIds: ['ingredient-1'],
      scheduledDate,
    });

    expect(result).toEqual({
      failedCredentials: [],
      postIds: ['post-1'],
      totalCreated: 1,
    });
    expect(posts).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        category: PostCategory.POST,
        credentialId: 'credential-1',
        description: 'Draft caption',
        ingredients: ['ingredient-1'],
        label: 'Persona',
        personaId: 'persona-1',
        platform: 'instagram',
        scheduledDate,
        targetExecutionState: TargetExecutionState.DRAFT,
        visibility: PostVisibility.PUBLIC,
      }),
    ]);
    expect(reviews).toEqual([
      {
        approvedItems: [],
        id: 'run-1',
        idempotencyKey: 'persona-review:org-1:post-1',
        items: [
          {
            caption: 'Draft caption',
            format: 'post',
            id: 'run-1-item-1',
            platform: 'instagram',
            postId: 'post-1',
            scheduledDate: '2026-12-31T00:00:00.000Z',
          },
        ],
      },
    ]);
  });

  it('approves the review only for posts the publish policy permits', async () => {
    seedPersona(['credential-1', 'credential-2']);
    seedCredential('credential-1', 'INSTAGRAM');
    seedCredential('credential-2', 'TWITTER');
    permittedPosts.add('post-2');

    await service.publishToAll(INPUT);

    expect(reviews.map(({ approvedItems, id }) => [id, approvedItems])).toEqual(
      [
        ['run-1', []],
        ['run-2', ['run-2-item-1']],
      ],
    );
  });

  it('groups all posts of one publication under one group id', async () => {
    seedPersona(['credential-1', 'credential-2']);
    seedCredential('credential-1', 'INSTAGRAM');
    seedCredential('credential-2', 'TWITTER');

    const result = await service.publishToAll(INPUT);

    expect(result.totalCreated).toBe(2);
    expect(new Set(posts.map((post) => post.groupId)).size).toBe(1);
  });

  it('publishes only credentials on the requested platforms', async () => {
    seedPersona(['credential-1', 'credential-2']);
    seedCredential('credential-1', 'INSTAGRAM');
    seedCredential('credential-2', 'TIKTOK');

    const result = await service.publishToAll({
      ...INPUT,
      platforms: ['TikTok'],
    });

    expect(result).toEqual({
      failedCredentials: [],
      postIds: ['post-1'],
      totalCreated: 1,
    });
    expect(
      posts.map(({ credentialId, platform }) => [credentialId, platform]),
    ).toEqual([['credential-2', 'tiktok']]);
  });

  it.each([
    ['missing', 'credential-x', {}],
    ['soft-deleted', 'credential-1', { isDeleted: true }],
    ['on another brand', 'credential-1', { brandId: 'brand-2' }],
    ['in another organization', 'credential-1', { organizationId: 'org-2' }],
  ])(
    'reports a %s credential as failed without posting',
    async (_case, personaCredential, fields) => {
      seedPersona([personaCredential]);
      seedCredential('credential-1', 'INSTAGRAM', fields);

      expect(await service.publishToAll(INPUT)).toEqual({
        failedCredentials: [personaCredential],
        postIds: [],
        totalCreated: 0,
      });
      expect(posts).toEqual([]);
    },
  );

  it('keeps publishing other credentials when one post cannot be created', async () => {
    seedPersona(['credential-1', 'credential-2']);
    seedCredential('credential-1', 'TWITTER');
    seedCredential('credential-2', 'INSTAGRAM');
    failingPlatforms.add('twitter');

    expect(await service.publishToAll(INPUT)).toEqual({
      failedCredentials: ['credential-1'],
      postIds: ['post-1'],
      totalCreated: 1,
    });
  });

  it('preserves a visible draft and reports failure when review linking fails', async () => {
    seedPersona(['credential-1']);
    seedCredential('credential-1', 'INSTAGRAM');
    permittedPosts.add('post-1');
    isReviewDown = true;

    expect(await service.publishToAll(INPUT)).toEqual({
      failedCredentials: ['credential-1'],
      postIds: ['post-1'],
      totalCreated: 1,
    });
    expect(posts).toEqual([
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    ]);
    expect(reviews).toEqual([]);
  });

  it.each([
    ['does not exist', []],
    [
      'belongs to another organization',
      [{ credentials: [], id: 'persona-1', organizationId: 'org-2' }],
    ],
  ])('throws when the persona %s', async (_case, rows) => {
    personas = rows;

    await expect(service.publishToAll(INPUT)).rejects.toThrow(
      NotFoundException,
    );
    expect(posts).toEqual([]);
  });
});
