import { VotesService } from '@api/collections/votes/services/votes.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VoteEntityModel } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VotesService.toggleVote', () => {
  const vote = {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const input = {
    entityId: 'ingredient-1',
    entityModel: VoteEntityModel.INGREDIENT,
    organizationId: 'org-1',
    userId: 'user-1',
  };
  let service: VotesService;

  beforeEach(() => {
    vi.clearAllMocks();
    vote.updateMany.mockResolvedValue({ count: 1 });
    service = new VotesService(
      { vote } as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  it('writes entityId and organizationId when no active vote exists', async () => {
    vote.findFirst.mockResolvedValue(null);
    vote.create.mockResolvedValue({ id: 'vote-1' });

    const result = await service.toggleVote(input);

    expect(result).toMatchObject({
      action: 'added',
      vote: { id: 'vote-1' },
      voteId: 'vote-1',
    });
    const data = vote.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      entityId: 'ingredient-1',
      entityModel: VoteEntityModel.INGREDIENT,
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(data).not.toHaveProperty('entity');
  });

  it('looks the existing vote up by entityId and user, ignoring deleted votes', async () => {
    vote.findFirst.mockResolvedValue(null);
    vote.create.mockResolvedValue({ id: 'vote-1' });

    await service.toggleVote(input);

    expect(vote.findFirst.mock.calls[0][0].where).toMatchObject({
      entityId: 'ingredient-1',
      entityModel: VoteEntityModel.INGREDIENT,
      organizationId: 'org-1',
      isDeleted: false,
      userId: 'user-1',
    });
  });

  it('removes the active vote instead of creating a second one', async () => {
    vote.findFirst.mockResolvedValue({ id: 'vote-1' });

    const result = await service.toggleVote(input);

    expect(result).toMatchObject({
      action: 'removed',
      vote: { id: 'vote-1', isDeleted: true },
      voteId: 'vote-1',
    });
    expect(vote.create).not.toHaveBeenCalled();
    expect(vote.updateMany.mock.calls[0][0]).toMatchObject({
      data: { isDeleted: true },
      where: {
        entityId: 'ingredient-1',
        entityModel: VoteEntityModel.INGREDIENT,
        organizationId: 'org-1',
        isDeleted: false,
        userId: 'user-1',
      },
    });
  });
});
