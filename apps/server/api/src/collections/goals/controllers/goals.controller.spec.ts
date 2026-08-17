import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GoalsController } from '@api/collections/goals/controllers/goals.controller';
import type { GoalDocument } from '@api/collections/goals/schemas/goal.schema';
import { GoalsService } from '@api/collections/goals/services/goals.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';

describe('GoalsController.canUserModifyEntity', () => {
  const organizationId = testId('org');
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
    userId: testId('user'),
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
      organizationId: testId('otherOrg'),
    } as GoalDocument;

    expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
  });

  it('denies when the entity organizationId is missing', () => {
    const entity = {} as GoalDocument;

    expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
  });
});
