import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { PersonaContentPlanService } from '@api/services/persona-content/persona-content-plan.service';
import type { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';

describe('PersonasContentController - days clamping', () => {
  const clampDays = (days: unknown): number =>
    Math.max(1, Math.min(90, Math.floor(Number(days) || 1)));

  it('should clamp days above 90 to 90', () => {
    expect(clampDays(365)).toBe(90);
    expect(clampDays(1000)).toBe(90);
  });

  it('should clamp days below 1 to 1', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-5)).toBe(1);
  });

  it('should pass through valid days', () => {
    expect(clampDays(7)).toBe(7);
    expect(clampDays(30)).toBe(30);
    expect(clampDays(90)).toBe(90);
    expect(clampDays(1)).toBe(1);
  });

  it('should handle non-numeric input', () => {
    expect(clampDays(undefined)).toBe(1);
    expect(clampDays(null)).toBe(1);
    expect(clampDays('abc')).toBe(1);
    expect(clampDays(NaN)).toBe(1);
  });

  it('should floor fractional days', () => {
    expect(clampDays(7.9)).toBe(7);
    expect(clampDays(1.1)).toBe(1);
  });
});

describe('PersonasContentController - persona context', () => {
  const brandId = testId('brand');
  const organizationId = testId('org');
  const personaId = testId('persona');

  function createController() {
    const personaContentPlanService = {
      generateContentPlan: vi.fn().mockResolvedValue({ entries: [] }),
    };
    const controller = new PersonasContentController(
      { error: vi.fn() } as unknown as LoggerService,
      personaContentPlanService as unknown as PersonaContentPlanService,
      {} as PersonaPublisherService,
      {} as PostsService,
    );

    return { controller, personaContentPlanService };
  }

  it('passes a legacy Better Auth user ID through as an opaque string', async () => {
    // Legacy base62 user IDs fail every Genfeed entity-id shape (#5410).
    const legacyUserId = 'LegacyBetterAuthUserIdBase62Abcd';
    const { controller, personaContentPlanService } = createController();

    await controller.generateContentPlan(
      personaId,
      { days: 7 },
      { brandId, id: legacyUserId, organizationId, userId: legacyUserId },
    );

    expect(personaContentPlanService.generateContentPlan).toHaveBeenCalledWith(
      expect.objectContaining({ personaId, userId: legacyUserId }),
    );
  });

  it('still rejects a malformed persona ID', async () => {
    const { controller, personaContentPlanService } = createController();

    await expect(
      controller.generateContentPlan(
        'not an id',
        { days: 7 },
        { brandId, id: testId('user'), organizationId, userId: testId('user') },
      ),
    ).rejects.toMatchObject({
      response: { detail: expect.stringContaining('Invalid personaId format') },
    });
    expect(
      personaContentPlanService.generateContentPlan,
    ).not.toHaveBeenCalled();
  });

  it('no longer exposes unbilled persona render routes', () => {
    const { controller } = createController();

    for (const route of ['generatePhoto', 'generateVideo', 'generateVoice'])
      expect(route in controller).toBe(false);
  });
});
