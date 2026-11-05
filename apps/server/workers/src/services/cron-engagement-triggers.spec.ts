import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { EngagementRuleState } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';

type Constructor = ConstructorParameters<typeof CronEngagementTriggersService>;

interface RuleRow {
  id: string;
  isDeleted: boolean;
  isEnabled: boolean;
  organizationId: string;
  state: EngagementRuleState;
  userId: string;
}

interface QueuedSweep {
  canonicalId: unknown;
  jobId: string;
  source: unknown;
}

/**
 * The cron against an in-memory engagement-rule table, a per-organization
 * Discovery switch and a workflow queue that keeps what was queued.
 */
function cronWith(rules: RuleRow[], discovery: Record<string, boolean>) {
  const queued: QueuedSweep[] = [];
  const prisma = {
    engagementRule: {
      findMany: async ({
        where,
      }: {
        where: Pick<RuleRow, 'isDeleted' | 'isEnabled' | 'state'>;
      }) =>
        rules
          .filter(
            (rule) =>
              rule.isDeleted === where.isDeleted &&
              rule.isEnabled === where.isEnabled &&
              rule.state === where.state,
          )
          .map(({ id, organizationId, userId }) => ({
            id,
            organizationId,
            userId,
          })),
    },
  };
  const workflowQueue = {
    queueSystemWorkflow: async (
      payload: { canonicalId: unknown; source: unknown },
      jobId: string,
    ) => {
      queued.push({
        canonicalId: payload.canonicalId,
        jobId,
        source: payload.source,
      });
    },
  };
  const moduleAccess = {
    canStartWork: async (organizationId: string, module: string) =>
      module === 'discovery' && discovery[organizationId] === true,
  };
  const service = new CronEngagementTriggersService(
    {} as LoggerService,
    prisma as unknown as PrismaService,
    {} as Constructor[2],
    {} as Constructor[3],
    {} as Constructor[4],
    workflowQueue as unknown as Constructor[5],
    moduleAccess as unknown as Constructor[6],
  );
  return { queued, service };
}

function rule(id: string, overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id,
    isDeleted: false,
    isEnabled: true,
    organizationId: 'org-1',
    state: EngagementRuleState.ARMED,
    userId: 'user-1',
    ...overrides,
  };
}

describe('CronEngagementTriggersService.processArmedRules', () => {
  it('queues nothing when no rule is armed', async () => {
    const { queued, service } = cronWith(
      [
        rule('rule-off', { isEnabled: false }),
        rule('rule-deleted', { isDeleted: true }),
        rule('rule-done', { state: EngagementRuleState.COMPLETED }),
      ],
      { 'org-1': true },
    );

    await service.processArmedRules();

    expect(queued).toEqual([]);
  });

  it('queues nothing when armed rules belong to organizations without Discovery', async () => {
    const { queued, service } = cronWith([rule('rule-1'), rule('rule-2')], {
      'org-1': false,
    });

    await service.processArmedRules();

    expect(queued).toEqual([]);
  });

  it('queues one sweep once an armed rule belongs to a Discovery organization', async () => {
    const { queued, service } = cronWith(
      [
        rule('rule-1'),
        rule('rule-2', { organizationId: 'org-2' }),
        rule('rule-3', { organizationId: 'org-2' }),
      ],
      { 'org-1': false, 'org-2': true },
    );

    await service.processArmedRules();

    expect(queued).toEqual([
      {
        canonicalId: 'engagement.sweep',
        jobId: expect.stringMatching(/^engagement-sweep-\d+$/),
        source: 'engagement_rule_sweep',
      },
    ]);
  });
});
