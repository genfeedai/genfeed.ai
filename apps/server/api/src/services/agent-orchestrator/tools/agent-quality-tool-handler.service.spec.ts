import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { VotesService } from '@api/collections/votes/services/votes.service';
import { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { VoteEntityModel } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface StoredVote {
  entityId: string;
  entityModel?: VoteEntityModel;
  id: string;
  organizationId: string;
  userId: string;
}

describe('AgentQualityToolHandler.rateIngredient', () => {
  const ctx: ToolExecutionContext = {
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const logger = {
    error: () => undefined,
    log: () => undefined,
  } as unknown as LoggerService;

  let ingredientLookups: number;
  let ingredientRows: Array<{
    id: string;
    isDeleted: boolean;
    organizationId: string;
  }>;
  let votes: StoredVote[];
  let votesService: VotesService;
  let handler: AgentQualityToolHandler;

  beforeEach(() => {
    ingredientLookups = 0;
    ingredientRows = [
      { id: 'ing-1', isDeleted: false, organizationId: 'org-1' },
      { id: 'foreign-ing', isDeleted: false, organizationId: 'org-2' },
    ];
    votes = [];

    const findIngredient = async (where: {
      id: string;
      isDeleted: boolean;
      organizationId: string;
    }) => {
      ingredientLookups += 1;
      return (
        ingredientRows.find(
          (row) =>
            row.id === where.id &&
            row.isDeleted === where.isDeleted &&
            row.organizationId === where.organizationId,
        ) ?? null
      );
    };
    const ingredients = {
      findOne: findIngredient,
      findOneSelect: findIngredient,
    } as unknown as IngredientsService;

    const sameVote = (vote: StoredVote, input: Omit<StoredVote, 'id'>) =>
      vote.entityId === input.entityId &&
      vote.organizationId === input.organizationId &&
      vote.userId === input.userId;
    votesService = {
      addVote: async (input: Omit<StoredVote, 'id'>) => {
        const existing = votes.find((vote) => sameVote(vote, input));
        if (existing) {
          return { created: false, vote: existing };
        }
        const vote = { ...input, id: `vote-${votes.length + 1}` };
        votes.push(vote);
        return { created: true, vote };
      },
      removeVote: async (input: Omit<StoredVote, 'id'>) => {
        const before = votes.length;
        votes = votes.filter((vote) => !sameVote(vote, input));
        return { removedCount: before - votes.length };
      },
    } as unknown as VotesService;

    handler = new AgentQualityToolHandler(
      logger,
      undefined,
      undefined,
      ingredients,
      votesService,
    );
  });

  it('records the caller’s vote on an ingredient in their organization', async () => {
    const result = await handler.rateIngredient({ ingredientId: 'ing-1' }, ctx);

    expect(votes).toEqual([
      {
        entityId: 'ing-1',
        entityModel: VoteEntityModel.INGREDIENT,
        id: 'vote-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);
    expect(result).toMatchObject({
      data: { action: 'added', ingredientId: 'ing-1', voteId: 'vote-1' },
      success: true,
    });
  });

  it('rejects an ingredient from another organization without writing a vote', async () => {
    const result = await handler.rateIngredient(
      { ingredientId: 'foreign-ing' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(votes).toEqual([]);
  });

  it('keeps the vote when the same ingredient is rated again', async () => {
    await handler.rateIngredient({ ingredientId: 'ing-1' }, ctx);
    const result = await handler.rateIngredient({ ingredientId: 'ing-1' }, ctx);

    expect(result).toMatchObject({
      data: { action: 'added', ingredientId: 'ing-1', voteId: 'vote-1' },
      success: true,
    });
    expect(votes).toHaveLength(1);
  });

  it('removes the vote only on an explicit remove action', async () => {
    await handler.rateIngredient({ ingredientId: 'ing-1' }, ctx);

    const result = await handler.rateIngredient(
      { action: 'remove', ingredientId: 'ing-1' },
      ctx,
    );

    expect(votes).toEqual([]);
    expect(result).toMatchObject({
      data: { action: 'removed', ingredientId: 'ing-1' },
      success: true,
    });
  });

  it('fails closed when ingredient validation is unavailable', async () => {
    const unvalidated = new AgentQualityToolHandler(
      logger,
      undefined,
      undefined,
      undefined,
      votesService,
    );

    const result = await unvalidated.rateIngredient(
      { ingredientId: 'ing-1' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(votes).toEqual([]);
  });

  it('requires an ingredientId', async () => {
    const result = await handler.rateIngredient({}, ctx);

    expect(result.success).toBe(false);
    expect(ingredientLookups).toBe(0);
  });
});
