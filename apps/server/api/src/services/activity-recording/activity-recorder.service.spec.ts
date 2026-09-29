import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';

type Row = Record<string, unknown>;

function makeRecorder(
  options: {
    members?: string[];
    disabledInApp?: boolean;
    existingEvent?: { activityId: string | null; id: string } | null;
    existingActivity?: Row | null;
  } = {},
) {
  const members = new Set(options.members ?? ['user-1', 'owner-1']);
  const deliveries: Row[] = [];
  const events: Row[] = [];
  const tx = {
    activity: {
      create: vi.fn(async ({ data }: { data: Row }) => ({
        createdAt: new Date('2026-09-27T10:00:00.000Z'),
        id: data.id ?? 'activity-1',
        isDeleted: false,
        updatedAt: new Date('2026-09-27T10:00:00.000Z'),
        ...data,
      })),
      findFirst: vi.fn(async () => options.existingActivity ?? null),
      update: vi.fn(async ({ data }: { data: Row }) => ({
        ...(options.existingActivity ?? {}),
        ...data,
      })),
    },
    member: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string } }) =>
        members.has(where.userId) ? { id: `member-${where.userId}` } : null,
      ),
    },
    notificationDelivery: {
      upsert: vi.fn(async ({ create }: { create: Row }) => {
        deliveries.push(create);
        return { id: `delivery-${deliveries.length}`, status: create.status };
      }),
    },
    notificationEvent: {
      findFirst: vi.fn(async () => options.existingEvent ?? null),
      upsert: vi.fn(async ({ create }: { create: Row }) => {
        events.push(create);
        return { id: 'event-1' };
      }),
    },
    notificationPreference: {
      findFirst: vi.fn(async () =>
        options.disabledInApp ? { isEnabled: false } : null,
      ),
    },
    organization: {
      findFirst: vi.fn(async () => ({ userId: 'owner-1' })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const queue = { enqueue: vi.fn() };
  const publisher = { publishInboxUpdate: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const emitter = { emitAsync: vi.fn() };
  const recorder = new ActivityRecorderService(
    prisma as never,
    queue as never,
    publisher as never,
    logger as never,
    emitter as never,
  );
  return {
    deliveries,
    emitter,
    events,
    logger,
    publisher,
    queue,
    recorder,
    tx,
  };
}

const base = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  source: ActivitySource.IMAGE_GENERATION,
  userId: 'user-1',
};

describe('ActivityRecorderService', () => {
  it('records history only when the key has no alert policy', async () => {
    const { deliveries, emitter, events, recorder, tx } = makeRecorder();

    const activity = await recorder.record({
      ...base,
      key: ActivityKey.IMAGE_GENERATED,
      value: 'ingredient-1',
    });

    expect(activity.key).toBe(ActivityKey.IMAGE_GENERATED);
    expect(tx.activity.create).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
    expect(deliveries).toHaveLength(0);
    expect(emitter.emitAsync).toHaveBeenCalledWith('activity.recorded', {
      activities: [
        expect.objectContaining({
          id: 'activity-1',
          key: ActivityKey.IMAGE_GENERATED,
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ],
    });
  });

  it('raises the policy alert linked to the activity in the same transaction', async () => {
    const { deliveries, events, publisher, queue, recorder, tx } =
      makeRecorder();

    await recorder.record({
      ...base,
      key: ActivityKey.IMAGE_FAILED,
      value: 'Provider timeout',
    });

    expect(tx.activity.create).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      expect.objectContaining({
        activityId: 'activity-1',
        deduplicationKey: `${ActivityKey.IMAGE_FAILED}/activity-1`,
        eventKey: ActivityKey.IMAGE_FAILED,
        organizationId: 'org-1',
        sourceId: 'activity-1',
        sourceType: 'activity',
      }),
    ]);
    expect(deliveries).toEqual([
      expect.objectContaining({
        channel: 'in_app',
        provider: 'inbox',
        status: 'delivered',
        topic: 'generation.status',
        userId: 'user-1',
      }),
    ]);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(publisher.publishInboxUpdate).toHaveBeenCalledWith('org-1', [
      'user-1',
    ]);
  });

  it('writes email as a pending delivery and enqueues it after commit', async () => {
    const { deliveries, queue, recorder } = makeRecorder();

    await recorder.record({
      ...base,
      alert: { deduplicationKey: 'workflow/run-1' },
      key: ActivityKey.WORKFLOW_EXECUTION_FAILED,
      source: ActivitySource.WORKFLOW_EXECUTION,
    });

    expect(deliveries.map((delivery) => delivery.channel)).toEqual([
      'in_app',
      'email',
    ]);
    expect(deliveries[1]).toEqual(
      expect.objectContaining({ provider: 'resend', status: 'pending' }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith('delivery-2');
  });

  it('narrows the policy channels but never widens them', async () => {
    const { deliveries, recorder } = makeRecorder();

    await recorder.record({
      ...base,
      alert: { channels: ['in_app', 'slack'] },
      key: ActivityKey.AGENT_RUN_COMPLETED,
      source: ActivitySource.AGENT_RUN,
    });

    expect(deliveries.map((delivery) => delivery.channel)).toEqual(['in_app']);
  });

  it('skips recipients who are not active members and in-app opt-outs', async () => {
    const nonMember = makeRecorder({ members: [] });
    await nonMember.recorder.record({ ...base, key: ActivityKey.VIDEO_FAILED });
    expect(nonMember.events).toHaveLength(1);
    expect(nonMember.deliveries).toHaveLength(0);

    const optedOut = makeRecorder({ disabledInApp: true });
    await optedOut.recorder.record({ ...base, key: ActivityKey.VIDEO_FAILED });
    expect(optedOut.deliveries).toHaveLength(0);
    expect(optedOut.publisher.publishInboxUpdate).not.toHaveBeenCalled();
  });

  it('routes owner and operator recipients from the policy', async () => {
    const { deliveries, logger, recorder } = makeRecorder();

    await recorder.record({
      ...base,
      alert: {
        operatorMessages: {
          discord: {
            action: 'low_credits_alert',
            payload: { balance: 12, organizationId: 'org-1' },
            type: 'discord',
          },
        },
      },
      key: ActivityKey.CREDITS_LOW,
      source: ActivitySource.SCRIPT,
      userId: null,
    });

    expect(deliveries).toEqual([
      expect.objectContaining({ channel: 'in_app', userId: 'owner-1' }),
      expect.objectContaining({
        channel: 'discord',
        destination: null,
        message: {
          action: 'low_credits_alert',
          payload: { balance: 12, organizationId: 'org-1' },
          type: 'discord',
        },
        provider: 'notifications',
        status: 'pending',
        userId: null,
      }),
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('skips an operator channel that has no rendered message', async () => {
    const { deliveries, logger, recorder } = makeRecorder();

    await recorder.record({
      ...base,
      key: ActivityKey.CREDITS_LOW,
      source: ActivitySource.SCRIPT,
    });

    expect(deliveries.map((delivery) => delivery.channel)).toEqual(['in_app']);
    expect(logger.warn).toHaveBeenCalledWith(
      'Operator alert has no rendered message',
      expect.objectContaining({ channel: 'discord' }),
    );
  });

  it('returns the first activity for a repeated deduplication key', async () => {
    const existing = {
      action: ActivityKey.SOCIAL_REPLIES_RECEIVED,
      data: { key: ActivityKey.SOCIAL_REPLIES_RECEIVED },
      id: 'activity-first',
      organizationId: 'org-1',
    };
    const { events, recorder, tx } = makeRecorder({
      existingActivity: existing,
      existingEvent: { activityId: 'activity-first', id: 'event-1' },
    });

    const activity = await recorder.record({
      ...base,
      alert: { deduplicationKey: 'reply/1' },
      key: ActivityKey.SOCIAL_REPLIES_RECEIVED,
      source: ActivitySource.SOCIAL_INTEGRATION,
    });

    expect(activity.id).toBe('activity-first');
    expect(tx.activity.create).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('treats a deterministic activity id as the idempotency key', async () => {
    const { recorder, tx } = makeRecorder({
      existingActivity: {
        action: ActivityKey.AGENT_RUN_DELIVERY_FAILED,
        data: {},
        id: 'fixed-id',
        organizationId: 'org-1',
      },
    });

    const activity = await recorder.record({
      ...base,
      id: 'fixed-id',
      key: ActivityKey.AGENT_RUN_DELIVERY_FAILED,
    });

    expect(activity.id).toBe('fixed-id');
    expect(tx.activity.create).not.toHaveBeenCalled();
  });

  it('raises an alert when an update changes the key to a policy key', async () => {
    const existing = {
      action: ActivityKey.IMAGE_PROCESSING,
      brandId: 'brand-1',
      createdAt: new Date('2026-09-27T09:00:00.000Z'),
      data: { key: ActivityKey.IMAGE_PROCESSING, value: '{}' },
      entityId: 'ingredient-1',
      entityModel: 'Ingredient',
      id: 'activity-9',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const failed = makeRecorder({ existingActivity: existing });
    await failed.recorder.update(
      { id: 'activity-9', organizationId: 'org-1' },
      { key: ActivityKey.IMAGE_FAILED, value: 'boom' },
    );
    expect(failed.tx.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'activity-9',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(failed.events).toEqual([
      expect.objectContaining({
        activityId: 'activity-9',
        deduplicationKey: `${ActivityKey.IMAGE_FAILED}/activity-9`,
      }),
    ]);

    const unchanged = makeRecorder({
      existingActivity: { ...existing, action: ActivityKey.IMAGE_FAILED },
    });
    await unchanged.recorder.update(
      { id: 'activity-9', organizationId: 'org-1' },
      { key: ActivityKey.IMAGE_FAILED, value: 'again' },
    );
    expect(unchanged.events).toHaveLength(0);
  });

  it('returns null when the activity to update is missing', async () => {
    const { recorder, tx } = makeRecorder();
    await expect(
      recorder.update({ id: 'missing', organizationId: 'org-1' }, {}),
    ).resolves.toBeNull();
    expect(tx.activity.update).not.toHaveBeenCalled();
  });

  it('dispatches transport messages without an activity', async () => {
    const { deliveries, events, queue, recorder, tx } = makeRecorder();

    await recorder.dispatch({
      deduplicationKey: 'revenue/in_1',
      messages: [
        {
          destination: null,
          message: {
            action: 'revenue_notification',
            payload: {
              amountMinor: 1200,
              currency: 'usd',
              organizationId: 'org-1',
              source: 'invoice',
            },
            type: 'discord',
          },
        },
      ],
      organizationId: 'org-1',
      source: { id: 'in_1', type: 'stripe_revenue' },
      topic: 'operator.alerts',
    });

    expect(tx.activity.create).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        eventKey: 'message.discord.revenue_notification',
        sourceType: 'stripe_revenue',
      }),
    ]);
    expect(deliveries).toEqual([
      expect.objectContaining({
        channel: 'discord',
        idempotencyKey: 'revenue/in_1/discord/operator',
        status: 'pending',
      }),
    ]);
    expect(queue.enqueue).toHaveBeenCalledWith('delivery-1');
  });

  it('hashes explicit destinations out of the idempotency key', async () => {
    const { deliveries, recorder } = makeRecorder();

    await recorder.dispatch({
      deduplicationKey: 'invite/1',
      messages: [
        {
          destination: 'invitee@example.com',
          message: {
            action: 'send_email',
            payload: {
              html: '<p>Join</p>',
              subject: 'Join',
              to: 'invitee@example.com',
            },
            type: 'email',
          },
        },
      ],
      organizationId: 'org-1',
      source: { id: 'invitation-1', type: 'invitation' },
      topic: 'lifecycle.onboarding',
    });

    expect(deliveries[0].destination).toBe('invitee@example.com');
    expect(String(deliveries[0].idempotencyKey)).not.toContain('@');
  });

  it('never throws from post-commit effects', async () => {
    const { emitter, logger, publisher, queue, recorder } = makeRecorder();
    queue.enqueue.mockRejectedValue(new Error('redis down'));
    publisher.publishInboxUpdate.mockRejectedValue(new Error('redis down'));
    emitter.emitAsync.mockRejectedValue(new Error('listener down'));

    await expect(
      recorder.afterCommit({
        activities: [
          {
            createdAt: new Date(),
            id: 'a',
            key: ActivityKey.IMAGE_GENERATED,
            organizationId: 'org-1',
            userId: 'user-1',
          } as never,
        ],
        inbox: [{ organizationId: 'org-1', userIds: ['user-1'] }],
        pendingDeliveryIds: ['delivery-1'],
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
