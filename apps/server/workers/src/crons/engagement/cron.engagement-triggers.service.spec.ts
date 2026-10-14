import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';
import {
  buildEngagementRuleWorkflowDefinition,
  buildEngagementSweepWorkflowDefinition,
} from '@workers/crons/engagement/engagement-sweep-workflow-definition';

describe('engagement sweep workflows', () => {
  it('fans discovery into child rule workflows', () => {
    const sweep = buildEngagementSweepWorkflowDefinition();
    expect(sweep.definition.nodes).toHaveLength(2);
    expect(sweep.definition.nodes[1]?.data.config.actionId).toBe(
      'workflow.for-each-tenant',
    );
  });

  it('uses executable outcome and publish conditions', () => {
    const child = buildEngagementRuleWorkflowDefinition();
    expect(
      child.definition.nodes.filter((node) => node.type === 'condition'),
    ).toHaveLength(4);
    expect(child.definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHandle: 'true' }),
        expect.objectContaining({ sourceHandle: 'false' }),
      ]),
    );
  });
});

describe('CronEngagementTriggersService.processArmedRules', () => {
  const findMany = vi.fn();
  const queueSystemWorkflow = vi.fn();
  const canStartWork = vi.fn();
  const service = new CronEngagementTriggersService(
    {} as never,
    { engagementRule: { findMany } } as never,
    {} as never,
    {} as never,
    {} as never,
    { queueSystemWorkflow } as never,
    { canStartWork } as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    queueSystemWorkflow.mockResolvedValue(undefined);
    canStartWork.mockResolvedValue(true);
  });

  it('queues nothing when no rule is armed', async () => {
    findMany.mockResolvedValue([]);

    await service.processArmedRules();

    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, organizationId: true, userId: true },
      where: { isDeleted: false, isEnabled: true, state: 'ARMED' },
    });
    expect(canStartWork).not.toHaveBeenCalled();
    expect(queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('queues nothing when armed rules belong to organizations without Discovery', async () => {
    findMany.mockResolvedValue([
      { id: 'rule-1', organizationId: 'org-1', userId: 'user-1' },
      { id: 'rule-2', organizationId: 'org-1', userId: 'user-1' },
    ]);
    canStartWork.mockResolvedValue(false);

    await service.processArmedRules();

    expect(canStartWork).toHaveBeenCalledTimes(1);
    expect(canStartWork).toHaveBeenCalledWith('org-1', 'discovery');
    expect(queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('queues the sweep once an armed rule belongs to a Discovery organization', async () => {
    findMany.mockResolvedValue([
      { id: 'rule-1', organizationId: 'org-1', userId: 'user-1' },
    ]);

    await service.processArmedRules();

    expect(queueSystemWorkflow).toHaveBeenCalledTimes(1);
    expect(queueSystemWorkflow.mock.calls[0]?.[0]).toMatchObject({
      canonicalId: 'engagement.sweep',
      source: 'engagement_rule_sweep',
    });
  });
});
