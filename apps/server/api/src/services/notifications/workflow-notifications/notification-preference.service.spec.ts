import { NotificationPreferenceService } from './notification-preference.service';

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
