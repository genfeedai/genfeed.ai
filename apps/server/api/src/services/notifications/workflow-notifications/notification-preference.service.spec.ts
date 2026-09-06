import { NotificationPreferenceService } from './notification-preference.service';

describe('NotificationPreferenceService', () => {
  it('defaults missing workflow email preferences to disabled', async () => {
    const prisma = {
      notificationPreference: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new NotificationPreferenceService(prisma as never);

    await expect(service.findForUser('user-1')).resolves.toMatchObject({
      channel: 'email',
      isEnabled: false,
      topic: 'workflow.status',
      userId: 'user-1',
    });
  });

  it('upserts the account-level toggle', async () => {
    const prisma = {
      notificationPreference: {
        upsert: vi.fn().mockResolvedValue({
          channel: 'email',
          createdAt: new Date('2026-08-22T00:00:00.000Z'),
          id: 'preference-1',
          isDeleted: false,
          isEnabled: true,
          topic: 'workflow.status',
          updatedAt: new Date('2026-08-22T00:00:00.000Z'),
          userId: 'user-1',
        }),
      },
    };
    const service = new NotificationPreferenceService(prisma as never);

    await service.setForUser('user-1', true);

    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      create: {
        channel: 'email',
        isEnabled: true,
        topic: 'workflow.status',
        userId: 'user-1',
      },
      update: { isDeleted: false, isEnabled: true },
      where: {
        userId_topic_channel: {
          channel: 'email',
          topic: 'workflow.status',
          userId: 'user-1',
        },
      },
    });
  });
});

describe('agent email preferences', () => {
  it('defaults independently to opt-out and writes only the chosen topic', async () => {
    const row = {
      id: 'pref',
      userId: 'user-1',
      channel: 'email',
      topic: 'agent.status',
      isEnabled: true,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(row),
      },
    };
    const service = new NotificationPreferenceService(prisma as never);
    await expect(
      service.findForUser('user-1', 'agent.status'),
    ).resolves.toMatchObject({ isEnabled: false, topic: 'agent.status' });
    await service.setForUser('user-1', true, 'agent.status');
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_topic_channel: {
            channel: 'email',
            topic: 'agent.status',
            userId: 'user-1',
          },
        },
      }),
    );
  });
});
