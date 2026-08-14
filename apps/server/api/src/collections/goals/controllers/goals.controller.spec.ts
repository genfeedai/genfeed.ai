import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GoalsController } from '@api/collections/goals/controllers/goals.controller';
import type { GoalDocument } from '@api/collections/goals/schemas/goal.schema';
import { GoalsService } from '@api/collections/goals/services/goals.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('GoalsController.canUserModifyEntity', () => {
  const organizationId = '507f191e810c19729de860ee';
  const controller = new GoalsController(
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
    {} as GoalsService,
  );

  const mockUser = {
    organizationId: organizationId,
    userId: '507f191e810c19729de860ef',
  } as unknown as User;

  it('allows modification when the canonical organization ID matches', () => {
    const entity = { organizationId } as GoalDocument;

    expect(controller.canUserModifyEntity(mockUser, entity)).toBe(true);
  });

  it('does not authorize from the legacy organization relation alias', () => {
    const entity = {
      organization: { id: organizationId },
    } as unknown as GoalDocument;

    expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
  });

  it('rejects modification when organizations differ', () => {
    const entity = {
      organizationId: '607f191e810c19729de860ff',
    } as GoalDocument;

    expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
  });

  it('denies when the entity organizationId is missing', () => {
    const entity = {} as GoalDocument;

    expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
  });
});
