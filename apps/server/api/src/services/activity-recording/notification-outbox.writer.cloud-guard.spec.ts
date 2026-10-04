import {
  buildGuardedDelegate,
  type GuardedRow,
} from '@api/collections/models/testing/cloud-guarded-delegate';
import {
  findOutboxEvent,
  runForEventOrganization,
  writeNotificationOutbox,
} from '@api/services/activity-recording/notification-outbox.writer';
import {
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';

const ORG = 'org-1';

function setup() {
  const events: GuardedRow[] = [];
  const deliveries: GuardedRow[] = [];
  const client = {
    notificationDelivery: buildGuardedDelegate(
      'NotificationDelivery',
      deliveries,
    ),
    notificationEvent: buildGuardedDelegate('NotificationEvent', events),
  };
  const inTenant = <T>(callback: () => Promise<T>) =>
    runWithTenantContext({ organizationId: ORG }, callback);
  const event = (organizationId: string | null) => ({
    deduplicationKey: `key-${organizationId ?? 'platform'}`,
    eventKey: 'test.event',
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    organizationId,
    payload: {},
    sourceId: 'source',
    sourceType: 'test',
  });
  const delivery = {
    channel: 'in_app',
    idempotencyKey: 'delivery-1',
    provider: 'in_app',
    topic: 'test',
  };

  return { client, delivery, deliveries, event, events, inTenant };
}

describe('notification outbox under the CLOUD tenant guard', () => {
  it('writes a platform event and its delivery from inside a tenant request', async () => {
    const { client, delivery, deliveries, event, events, inTenant } = setup();

    const result = await inTenant(() =>
      writeNotificationOutbox(client as never, event(null), [delivery]),
    );

    expect(result.deliveryIds).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.organizationId).toBeNull();
    expect(deliveries).toHaveLength(1);
  });

  it('writes a tenant event under its own scope', async () => {
    const { client, delivery, event, events, inTenant } = setup();

    await inTenant(() =>
      writeNotificationOutbox(client as never, event(ORG), [delivery]),
    );

    expect(events[0]?.organizationId).toBe(ORG);
  });

  it('finds a platform event by deduplication key without leaking tenant events', async () => {
    const { client, delivery, event, inTenant } = setup();
    await inTenant(() =>
      writeNotificationOutbox(client as never, event(null), [delivery]),
    );
    await inTenant(() =>
      writeNotificationOutbox(client as never, event(ORG), []),
    );

    const platform = await inTenant(() =>
      findOutboxEvent(client as never, null, 'key-platform'),
    );
    const crossed = await inTenant(() =>
      findOutboxEvent(client as never, null, `key-${ORG}`),
    );

    expect(platform).not.toBeNull();
    expect(crossed).toBeNull();
  });

  it('opens the hatch only for a platform event', async () => {
    const platform = await runForEventOrganization(null, async () =>
      isCrossOrgUnsafe(),
    );
    const tenant = await runForEventOrganization(ORG, async () =>
      isCrossOrgUnsafe(),
    );

    expect(platform).toBe(true);
    expect(tenant).toBe(false);
  });
});
