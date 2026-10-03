import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { VotesService } from '@api/collections/votes/services/votes.service';
import { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { VoteEntityModel } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentQualityToolHandler.rateIngredient', () => {
  const ctx: ToolExecutionContext = {
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  let ingredients: { findOne: ReturnType<typeof vi.fn> };
  let votes: { toggleVote: ReturnType<typeof vi.fn> };
  let handler: AgentQualityToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    ingredients = { findOne: vi.fn().mockResolvedValue({ id: 'ing-1' }) };
    votes = {
      toggleVote: vi
        .fn()
        .mockResolvedValue({ action: 'added', voteId: 'vote-1' }),
    };
    handler = new AgentQualityToolHandler(
      logger as unknown as LoggerService,
      undefined,
      undefined,
      ingredients as unknown as IngredientsService,
      votes as unknown as VotesService,
    );
  });

  it('validates the ingredient against the caller organization before voting', async () => {
    const result = await handler.rateIngredient({ ingredientId: 'ing-1' }, ctx);

    expect(ingredients.findOne).toHaveBeenCalledWith({
      id: 'ing-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(votes.toggleVote).toHaveBeenCalledWith({
      entityId: 'ing-1',
      entityModel: VoteEntityModel.INGREDIENT,
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(result).toMatchObject({
      data: { action: 'added', ingredientId: 'ing-1', voteId: 'vote-1' },
      success: true,
    });
  });

  it('rejects an ingredient from another organization without writing a vote', async () => {
    ingredients.findOne.mockResolvedValue(null);

    const result = await handler.rateIngredient(
      { ingredientId: 'foreign-ing' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(votes.toggleVote).not.toHaveBeenCalled();
  });

  it('reports a removal when the user rates the same ingredient again', async () => {
    votes.toggleVote.mockResolvedValue({
      action: 'removed',
      voteId: 'vote-1',
    });

    const result = await handler.rateIngredient({ ingredientId: 'ing-1' }, ctx);

    expect(result).toMatchObject({
      data: { action: 'removed', ingredientId: 'ing-1' },
      success: true,
    });
  });

  it('fails closed when ingredient validation is unavailable', async () => {
    const unvalidated = new AgentQualityToolHandler(
      logger as unknown as LoggerService,
      undefined,
      undefined,
      undefined,
      votes as unknown as VotesService,
    );

    const result = await unvalidated.rateIngredient(
      { ingredientId: 'ing-1' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(votes.toggleVote).not.toHaveBeenCalled();
  });

  it('requires an ingredientId', async () => {
    const result = await handler.rateIngredient({}, ctx);
    expect(result.success).toBe(false);
    expect(ingredients.findOne).not.toHaveBeenCalled();
  });
});
