import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { PersonaContentService } from '@api/services/persona-content/persona-content.service';
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
    const personaContentService = {
      generatePhoto: vi.fn().mockResolvedValue({ id: testId('ingredient') }),
    };
    const controller = new PersonasContentController(
      { error: vi.fn() } as unknown as LoggerService,
      personaContentService as unknown as PersonaContentService,
      {} as PersonaContentPlanService,
      {} as PersonaPublisherService,
      {} as PostsService,
    );

    return { controller, personaContentService };
  }

  it('passes a legacy Better Auth user ID through as an opaque string', async () => {
    // Legacy base62 user IDs fail every Genfeed entity-id shape (#5410).
    const legacyUserId = 'LegacyBetterAuthUserIdBase62Abcd';
    const { controller, personaContentService } = createController();

    await controller.generatePhoto(
      personaId,
      { prompt: 'portrait' },
      { brandId, id: legacyUserId, organizationId, userId: legacyUserId },
    );

    expect(personaContentService.generatePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ personaId, userId: legacyUserId }),
    );
  });

  it('still rejects a malformed persona ID', async () => {
    const { controller, personaContentService } = createController();

    await expect(
      controller.generatePhoto(
        'not an id',
        { prompt: 'portrait' },
        { brandId, id: testId('user'), organizationId, userId: testId('user') },
      ),
    ).rejects.toMatchObject({
      response: { detail: expect.stringContaining('Invalid personaId format') },
    });
    expect(personaContentService.generatePhoto).not.toHaveBeenCalled();
  });
});
