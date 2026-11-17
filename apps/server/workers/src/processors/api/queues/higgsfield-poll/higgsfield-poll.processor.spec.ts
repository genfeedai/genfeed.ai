import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { HIGGSFIELD_POLL_MAX_ATTEMPTS } from '@genfeedai/contracts/queue';
import { HiggsFieldPollProcessor } from '@workers/processors/api/queues/higgsfield-poll/higgsfield-poll.processor';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

type RequestState =
  | { state: 'pending' }
  | { state: 'completed'; videoUrl: string }
  | { reason: string; state: 'failed' };

/** A stateful stand-in for the ingredient, provider and queue the poll job touches. */
function harness(
  request: RequestState,
  status: IngredientStatus = IngredientStatus.PROCESSING,
) {
  const ingredient = { status, videoUrl: null as string | null, error: '' };
  const scheduled: Array<{ attempt: number }> = [];
  const processor = new HiggsFieldPollProcessor(
    { readVideoRequest: vi.fn().mockResolvedValue(request) } as never,
    {
      findOneSelect: vi.fn().mockResolvedValue(ingredient),
    } as never,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    {
      schedule: vi.fn(async (data: { attempt: number }) => {
        scheduled.push(data);
        return 'job';
      }),
    } as never,
    {
      handleFailedGenerationForIngredient: vi.fn(
        async (_id: string, reason: string) => {
          ingredient.status = IngredientStatus.FAILED;
          ingredient.error = reason;
        },
      ),
      processMediaForIngredient: vi.fn(
        async (_id: string, category: string, url: string) => {
          expect(category).toBe(IngredientCategory.VIDEO);
          ingredient.status = IngredientStatus.GENERATED;
          ingredient.videoUrl = url;
        },
      ),
    } as never,
  );
  const run = (attempt: number) =>
    processor.process({
      data: {
        attempt,
        externalId: 'hf-request-1',
        ingredientId: 'ingredient-1',
        organizationId: 'org-1',
      },
    } as Job<never>);
  return { ingredient, run, scheduled };
}

describe('HiggsFieldPollProcessor', () => {
  it('stores the video of a request that finished while the submitting process was gone', async () => {
    const { ingredient, run } = harness({
      state: 'completed',
      videoUrl: 'https://cdn.test/cinema.mp4',
    });

    await run(1);

    expect(ingredient).toMatchObject({
      status: IngredientStatus.GENERATED,
      videoUrl: 'https://cdn.test/cinema.mp4',
    });
  });

  it('polls again with the next attempt while the request is still running', async () => {
    const { ingredient, run, scheduled } = harness({ state: 'pending' });

    await run(3);

    expect(scheduled).toEqual([expect.objectContaining({ attempt: 4 })]);
    expect(ingredient.status).toBe(IngredientStatus.PROCESSING);
  });

  it('fails the ingredient with the provider reason when the request was rejected', async () => {
    const { ingredient, run, scheduled } = harness({
      reason: 'Higgsfield job hf-request-1 was rejected by the safety filter.',
      state: 'failed',
    });

    await run(2);

    expect(ingredient).toMatchObject({
      error: 'Higgsfield job hf-request-1 was rejected by the safety filter.',
      status: IngredientStatus.FAILED,
    });
    expect(scheduled).toEqual([]);
  });

  it('fails the ingredient once the polling ceiling passes with the request still running', async () => {
    const { ingredient, run, scheduled } = harness({ state: 'pending' });

    await run(HIGGSFIELD_POLL_MAX_ATTEMPTS);

    expect(ingredient).toMatchObject({
      error: 'Higgsfield polling timed out',
      status: IngredientStatus.FAILED,
    });
    expect(scheduled).toEqual([]);
  });

  it('leaves an ingredient that already settled alone', async () => {
    const { ingredient, run, scheduled } = harness(
      { state: 'completed', videoUrl: 'https://cdn.test/late.mp4' },
      IngredientStatus.FAILED,
    );

    await run(1);

    expect(ingredient).toMatchObject({
      status: IngredientStatus.FAILED,
      videoUrl: null,
    });
    expect(scheduled).toEqual([]);
  });
});
