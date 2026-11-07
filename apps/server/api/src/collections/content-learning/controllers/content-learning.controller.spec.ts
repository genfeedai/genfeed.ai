import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentLearningController } from '@api/collections/content-learning/controllers/content-learning.controller';
import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import type { LearningOperationService } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningReadService } from '@api/collections/content-learning/services/learning-read.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(),
  serializeSingle: vi.fn((_request: unknown, _serializer: unknown, item) => ({
    data: item,
  })),
}));

type Row = Record<string, unknown>;

const user = {
  id: 'user',
  organizationId: 'org',
  userId: 'user',
} as AuthenticatedUser;
const request = {} as Request;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) =>
    key === 'OR'
      ? (condition as Row[]).some((part) => matches(row, part))
      : row[key] === condition,
  );
}

interface Tables {
  credentials: Row[];
  decisions: Row[];
  members: Row[];
  posts: Row[];
}

function tables(): Tables {
  return {
    credentials: [{ id: 'credential', organizationId: 'org' }],
    decisions: [
      {
        brandId: 'brand',
        credentialId: 'credential',
        generationId: 'post',
        id: 'decision',
        isDeleted: false,
        organizationId: 'org',
      },
      {
        brandId: 'brand',
        credentialId: 'credential',
        generationId: 'other-post',
        id: 'unrelated',
        isDeleted: false,
        organizationId: 'org',
      },
    ],
    members: [{ organizationId: 'org', userId: 'user' }],
    posts: [
      {
        brandId: 'brand',
        credentialId: 'credential',
        id: 'post',
        isDeleted: false,
        learningDecisionId: null,
        organizationId: 'org',
      },
    ],
  };
}

/** Posts, learning decisions, connected credentials and organization members. */
function buildController(data: Tables) {
  const prisma = {
    contentLearningDecision: {
      findMany: async ({ take, where }: { take: number; where: Row }) =>
        data.decisions.filter((row) => matches(row, where)).slice(0, take),
    },
    post: {
      findFirst: async ({ where }: { where: Row }) =>
        data.posts.find((row) => matches(row, where)) ?? null,
    },
  };
  const accounts = {
    credential: async (organizationId: string, credentialId: string) => {
      const credential = data.credentials.find(
        (row) =>
          row.id === credentialId && row.organizationId === organizationId,
      );
      if (!credential) throw new Error('forbidden');
      return credential;
    },
  };
  const operations = {
    assertMember: async (actor: {
      actorId: string;
      organizationId: string;
    }) => {
      if (
        !data.members.some(
          (row) =>
            row.userId === actor.actorId &&
            row.organizationId === actor.organizationId,
        )
      ) {
        throw new Error('not a member');
      }
    },
  };
  return new ContentLearningController(
    accounts as unknown as LearningAccountService,
    operations as unknown as LearningOperationService,
    new LearningReadService(
      prisma as unknown as PrismaService,
      accounts as unknown as LearningAccountService,
    ),
  );
}

describe('GET content-learning/posts/:postId/decision', () => {
  it('serializes the decision that generated the post after member and credential authorization', async () => {
    await expect(
      buildController(tables()).postDecision(request, user, 'post'),
    ).resolves.toEqual({ data: expect.objectContaining({ id: 'decision' }) });
  });

  it('also matches the decision bound at publication', async () => {
    const data = tables();
    data.decisions[0].generationId = 'regenerated';
    data.posts[0].learningDecisionId = 'decision';

    await expect(
      buildController(data).postDecision(request, user, 'post'),
    ).resolves.toEqual({ data: expect.objectContaining({ id: 'decision' }) });
  });

  it.each([
    [
      'a cross-organization post',
      (data: Tables) => {
        data.posts[0].organizationId = 'other-org';
      },
    ],
    [
      'an accountless post',
      (data: Tables) => {
        data.posts[0].credentialId = null;
      },
    ],
    [
      'no decision',
      (data: Tables) => {
        data.decisions[0].isDeleted = true;
      },
    ],
    [
      'ambiguous decisions',
      (data: Tables) => {
        data.decisions[1].generationId = 'post';
      },
    ],
  ])('returns 404 for %s', async (_case, change) => {
    const data = tables();
    change(data);

    await expect(
      buildController(data).postDecision(request, user, 'post'),
    ).rejects.toThrow('Decision not found');
  });

  it.each([
    [
      'the credential is no longer authorized',
      'forbidden',
      (data: Tables) => {
        data.credentials.length = 0;
      },
    ],
    [
      'the caller is not a member',
      'not a member',
      (data: Tables) => {
        data.members.length = 0;
      },
    ],
  ])('propagates the failure when %s', async (_case, message, change) => {
    const data = tables();
    change(data);

    await expect(
      buildController(data).postDecision(request, user, 'post'),
    ).rejects.toThrow(message);
  });
});
