import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentLearningController } from '@api/collections/content-learning/controllers/content-learning.controller';
import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import type { LearningOperationService } from '@api/collections/content-learning/services/learning-operation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(),
  serializeSingle: vi.fn((_request: unknown, _serializer: unknown, item) => ({
    data: item,
  })),
}));

const user = {
  id: 'user',
  userId: 'user',
  organizationId: 'org',
} as AuthenticatedUser;
const request = {} as Request;
function fixture() {
  const post = {
    id: 'post',
    brandId: 'brand',
    credentialId: 'credential' as string | null,
    learningDecisionId: null as string | null,
  };
  const prisma = {
    post: { findFirst: vi.fn().mockImplementation(() => post) },
    contentLearningDecision: {
      findMany: vi.fn().mockResolvedValue([{ id: 'decision' }]),
    },
  };
  const accounts = { credential: vi.fn().mockResolvedValue({}) };
  const operations = { assertMember: vi.fn().mockResolvedValue(undefined) };
  const controller = new ContentLearningController(
    accounts as unknown as LearningAccountService,
    operations as unknown as LearningOperationService,
    prisma as unknown as PrismaService,
  );
  return { controller, prisma, accounts, operations, post };
}
describe('GET content-learning/posts/:postId/decision', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });
  it('serializes the decision that generated the post after member and credential authorization', async () => {
    expect(await f.controller.postDecision(request, user, 'post')).toEqual({
      data: { id: 'decision' },
    });
    expect(f.operations.assertMember).toHaveBeenCalledWith({
      organizationId: 'org',
      actorId: 'user',
    });
    expect(f.prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post', organizationId: 'org', isDeleted: false },
      }),
    );
    expect(f.accounts.credential).toHaveBeenCalledWith('org', 'credential');
    expect(f.prisma.contentLearningDecision.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        isDeleted: false,
        OR: [{ generationId: 'post' }],
      },
      take: 2,
    });
  });
  it('also matches the decision bound at publication', async () => {
    f.post.learningDecisionId = 'bound';
    await f.controller.postDecision(request, user, 'post');
    expect(f.prisma.contentLearningDecision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ generationId: 'post' }, { id: 'bound' }],
        }),
      }),
    );
  });
  it.each([
    ['cross-organization post', 'post'],
    ['accountless post', 'credential'],
    ['no decision', 'none'],
    ['ambiguous decisions', 'two'],
  ])('returns 404 for %s', async (_, kind) => {
    if (kind === 'post') f.prisma.post.findFirst.mockResolvedValue(null);
    if (kind === 'credential') f.post.credentialId = null;
    if (kind === 'none')
      f.prisma.contentLearningDecision.findMany.mockResolvedValue([]);
    if (kind === 'two')
      f.prisma.contentLearningDecision.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);
    await expect(
      f.controller.postDecision(request, user, 'post'),
    ).rejects.toThrow('Decision not found');
  });
  it('propagates credential authorization failure before reading decisions', async () => {
    const failure = new Error('forbidden');
    f.accounts.credential.mockRejectedValue(failure);
    await expect(f.controller.postDecision(request, user, 'post')).rejects.toBe(
      failure,
    );
    expect(f.prisma.contentLearningDecision.findMany).not.toHaveBeenCalled();
  });
});
