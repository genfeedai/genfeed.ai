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
          isEnabled: true,
          topic: 'workflow.status',
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
