import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MusicGenerationCreditsService } from '@api/collections/musics/services/music-generation-credits.service';
import { ActivitySource, PricingType } from '@genfeedai/contracts';

describe('MusicGenerationCreditsService', () => {
  const user = {
    id: 'auth-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;

  const createHarness = (modelData: Record<string, unknown> | null) => {
    const creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    };
    const loggerService = { error: vi.fn(), log: vi.fn() };
    const modelsService = { findOne: vi.fn().mockResolvedValue(modelData) };
    const service = new MusicGenerationCreditsService(
      creditsUtilsService as never,
      loggerService as never,
      modelsService as never,
    );
    return { creditsUtilsService, loggerService, modelsService, service };
  };

  it('deducts the flat cost for a FLAT-priced model, ignoring duration', async () => {
    const { creditsUtilsService, service } = createHarness({
      cost: 7,
      pricingType: PricingType.FLAT,
    });

    await service.settle(user, 'meta/musicgen', 1, 'generation-1', 90);

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      7,
      'Music generation - meta/musicgen',
      ActivitySource.MUSIC_GENERATION,
    );
  });

  it('bills a PER_SECOND model by duration via costPerUnit', async () => {
    const { creditsUtilsService, service } = createHarness({
      cost: 120,
      costPerUnit: 4,
      minCost: 40,
      pricingType: PricingType.PER_SECOND,
    });

    await service.settle(
      user,
      'fal-ai/elevenlabs/music',
      1,
      'generation-1',
      30,
    );

    // 30s * 4 = 120, above the 40 minCost floor.
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      120,
      'Music generation - fal-ai/elevenlabs/music',
      ActivitySource.MUSIC_GENERATION,
    );
  });

  it('applies minCost as a floor for a short PER_SECOND duration', async () => {
    const { creditsUtilsService, service } = createHarness({
      cost: 120,
      costPerUnit: 4,
      minCost: 40,
      pricingType: PricingType.PER_SECOND,
    });

    await service.settle(user, 'fal-ai/elevenlabs/music', 1, 'generation-1', 5);

    // 5s * 4 = 20, below the 40 minCost floor.
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      40,
      'Music generation - fal-ai/elevenlabs/music',
      ActivitySource.MUSIC_GENERATION,
    );
  });

  it('falls back to the flat cost when duration is not supplied for a PER_SECOND model', async () => {
    const { creditsUtilsService, service } = createHarness({
      cost: 120,
      costPerUnit: 4,
      pricingType: PricingType.PER_SECOND,
    });

    await service.settle(user, 'fal-ai/elevenlabs/music', 1, 'generation-1');

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      120,
      'Music generation - fal-ai/elevenlabs/music',
      ActivitySource.MUSIC_GENERATION,
    );
  });

  it('multiplies the resolved cost by output count for extra outputs', async () => {
    const { creditsUtilsService, service } = createHarness({
      cost: 120,
      costPerUnit: 4,
      minCost: 40,
      pricingType: PricingType.PER_SECOND,
    });

    await service.settle(
      user,
      'fal-ai/elevenlabs/music',
      3,
      'generation-1',
      30,
    );

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      360,
      'Music generation - fal-ai/elevenlabs/music (3 outputs)',
      ActivitySource.MUSIC_GENERATION,
    );
  });

  it('skips the deduction entirely when the model is unknown', async () => {
    const { creditsUtilsService, service } = createHarness(null);

    await service.settle(user, 'unknown-model', 1, 'generation-1', 30);

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });
});
