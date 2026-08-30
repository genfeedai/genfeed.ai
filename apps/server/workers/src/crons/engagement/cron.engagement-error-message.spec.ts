import { EngagementRuleState } from '@genfeedai/enums';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';

describe('engagement failure messages', () => {
  it.each([
    { expected: 'provider failed', failure: new Error('provider failed') },
    { expected: '', failure: new Error('') },
    { expected: 'plain failure', failure: { message: 'plain failure' } },
    { expected: 'Engagement action failed', failure: 'plain failure' },
  ])(
    'preserves the persisted message for $failure',
    async ({ expected, failure }) => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const service = new CronEngagementTriggersService(
        {} as never,
        { engagementRule: { updateMany } } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const finalizeFailure = (
        service as unknown as {
          finalizeFailure: (
            request: { organizationId: string; ruleId: string },
            failure: unknown,
          ) => Promise<{ completed: boolean }>;
        }
      ).finalizeFailure.bind(service);

      await expect(
        finalizeFailure({ organizationId: 'org-1', ruleId: 'rule-1' }, failure),
      ).resolves.toEqual({ completed: true });
      expect(updateMany).toHaveBeenCalledWith({
        data: { lastError: expected, state: EngagementRuleState.COMPLETED },
        where: { id: 'rule-1', isDeleted: false, organizationId: 'org-1' },
      });
    },
  );
});
