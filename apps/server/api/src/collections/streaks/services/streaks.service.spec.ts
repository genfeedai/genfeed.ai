import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { ActivityKey } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

function createExecResult<T>(value: T) {
  return {
    exec: vi.fn().mockResolvedValue(value),
  };
}

describe('StreaksService', () => {
  const createService = () => {
    const model = {
      create: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
    };
    const activityModel = {
      find: vi.fn(),
    };
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    const creditsUtilsService = {
      addOrganizationCreditsWithExpiration: vi
        .fn()
        .mockResolvedValue(undefined),
    };
    const notificationsService = {
      sendNotification: vi.fn().mockResolvedValue(undefined),
    };

    const service = new StreaksService(
      model as never,
      activityModel as never,
      logger,
      creditsUtilsService as never,
      notificationsService as never,
    );

    return {
      activityModel,
      creditsUtilsService,
      model,
      notificationsService,
      service,
    };
  };

  it('creates a new streak on first qualifying activity', async () => {
    const { model, service } = createService();
    const createdStreak = {
      _id: 'streak-1',
      currentStreak: 1,
      lastActivityDate: new Date('2026-03-11T00:00:00.000Z'),
      longestStreak: 1,
      milestoneHistory: [],
      milestones: [],
      save: vi.fn().mockResolvedValue(undefined),
      streakFreezes: 0,
      streakStartDate: new Date('2026-03-11T00:00:00.000Z'),
      totalContentDays: 1,
    };

    model.findOne.mockReturnValue(createExecResult(null));
    model.create.mockResolvedValue(createdStreak);

    const result = await service.checkAndUpdate(
      '67a123456789012345678901',
      '67a123456789012345678902',
      new Date('2026-03-11T10:30:00.000Z'),
    );

    expect(model.create).toHaveBeenCalled();
    expect(result.streak.currentStreak).toBe(1);
    expect(result.newMilestones).toEqual([]);
  });

  it('does not increment twice on the same UTC day', async () => {
    const { creditsUtilsService, model, notificationsService, service } =
      createService();
    const existingStreak = {
      _id: 'streak-1',
      currentStreak: 5,
      lastActivityDate: new Date('2026-03-11T00:00:00.000Z'),
      longestStreak: 5,
      milestoneHistory: [],
      milestones: [3],
      save: vi.fn().mockResolvedValue(undefined),
      streakFreezes: 1,
      streakStartDate: new Date('2026-03-07T00:00:00.000Z'),
      totalContentDays: 5,
    };

    model.findOne.mockReturnValue(createExecResult(existingStreak));

    const result = await service.checkAndUpdate(
      '67a123456789012345678901',
      '67a123456789012345678902',
      new Date('2026-03-11T17:45:00.000Z'),
    );

    expect(result.streak.currentStreak).toBe(5);
    expect(result.newMilestones).toEqual([]);
    expect(existingStreak.save).not.toHaveBeenCalled();
    expect(notificationsService.sendNotification).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
  });

  it('increments on a consecutive day and awards the 3-day milestone once', async () => {
    const { creditsUtilsService, model, notificationsService, service } =
      createService();
    const existingStreak = {
      _id: 'streak-1',
      currentStreak: 2,
      lastActivityDate: new Date('2026-03-10T00:00:00.000Z'),
      longestStreak: 2,
      milestoneHistory: [],
      milestones: [],
      save: vi.fn().mockResolvedValue(undefined),
      streakFreezes: 0,
      streakStartDate: new Date('2026-03-09T00:00:00.000Z'),
      totalContentDays: 2,
    };

    model.findOne.mockReturnValue(createExecResult(existingStreak));

    const result = await service.checkAndUpdate(
      '67a123456789012345678901',
      '67a123456789012345678902',
      new Date('2026-03-11T09:00:00.000Z'),
    );

    expect(result.streak.currentStreak).toBe(3);
    expect(result.newMilestones).toEqual([3]);
    expect(existingStreak.milestones).toEqual([3]);
    expect(existingStreak.save).toHaveBeenCalled();
    expect(notificationsService.sendNotification).toHaveBeenCalledTimes(1);
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
  });

  it('processes at-risk, frozen, and broken streaks during stale sweep', async () => {
    const { model, notificationsService, service } = createService();
    const atRiskStreak = {
      currentStreak: 4,
      organization: 'org-1',
      user: 'user-1',
    };
    const frozenStreak = {
      currentStreak: 8,
      lastActivityDate: new Date('2026-03-08T00:00:00.000Z'),
      organization: 'org-1',
      save: vi.fn().mockResolvedValue(undefined),
      streakFreezes: 1,
      user: 'user-2',
    };
    const brokenStreak = {
      currentStreak: 6,
      lastActivityDate: new Date('2026-03-08T00:00:00.000Z'),
      organization: 'org-1',
      save: vi.fn().mockResolvedValue(undefined),
      streakFreezes: 0,
      streakStartDate: new Date('2026-03-03T00:00:00.000Z'),
      user: 'user-3',
    };

    model.find
      .mockReturnValueOnce(createExecResult([atRiskStreak]))
      .mockReturnValueOnce(createExecResult([frozenStreak, brokenStreak]));

    const result = await service.processStaleStreaks(
      new Date('2026-03-11T00:30:00.000Z'),
    );

    expect(result).toEqual({ atRisk: 1, broken: 1, frozen: 1 });
    expect(frozenStreak.streakFreezes).toBe(0);
    expect(frozenStreak.lastFreezeUsedAt).toBeInstanceOf(Date);
    expect(frozenStreak.save).toHaveBeenCalled();
    expect(brokenStreak.currentStreak).toBe(0);
    expect(brokenStreak.lastBrokenAt).toBeInstanceOf(Date);
    expect(brokenStreak.lastBrokenStreak).toBe(6);
    expect(brokenStreak.save).toHaveBeenCalled();
    expect(notificationsService.sendNotification).toHaveBeenCalledTimes(3);
  });

  it('builds summary milestone states, badge milestones, and active status', async () => {
    const { model, service } = createService();
    const streak = {
      _id: 'streak-1',
      currentStreak: 30,
      lastActivityDate: new Date(),
      lastBrokenAt: null,
      lastBrokenStreak: null,
      lastFreezeUsedAt: null,
      longestStreak: 30,
      milestoneHistory: [
        {
          achievedAt: new Date('2026-03-11T00:00:00.000Z'),
          milestone: 30,
          reward: '30-day badge + 50 credits',
        },
      ],
      milestones: [3, 7, 30],
      streakFreezes: 1,
      streakStartDate: new Date('2026-02-10T00:00:00.000Z'),
      totalContentDays: 30,
    };

    model.findOne.mockReturnValue(createExecResult(streak));

    const summary = await service.getStreakSummary(
      '67a123456789012345678901',
      '67a123456789012345678902',
    );

    expect(summary.status).toBe('active');
    expect(summary.badgeMilestones).toEqual([30]);
    expect(summary.milestoneStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          achievedAt: expect.any(Date),
          days: 30,
          isAchieved: true,
          isNext: false,
        }),
        expect.objectContaining({
          days: 100,
          isAchieved: false,
          isNext: true,
        }),
      ]),
    );
  });

  it('marks summary as at risk when yesterday was the last active day', async () => {
    const { model, service } = createService();
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    model.findOne.mockReturnValue(
      createExecResult({
        _id: 'streak-1',
        currentStreak: 5,
        lastActivityDate: yesterday,
        lastBrokenAt: null,
        lastBrokenStreak: null,
        lastFreezeUsedAt: null,
        longestStreak: 8,
        milestoneHistory: [],
        milestones: [3],
        streakFreezes: 0,
        streakStartDate: new Date('2026-03-07T00:00:00.000Z'),
        totalContentDays: 5,
      }),
    );

    const summary = await service.getStreakSummary(
      '67a123456789012345678901',
      '67a123456789012345678902',
    );

    expect(summary.status).toBe('at_risk');
  });

  it('recognizes qualifying activity keys', () => {
    const { service } = createService();

    expect(service.isQualifyingActivityKey(ActivityKey.IMAGE_GENERATED)).toBe(
      true,
    );
    expect(service.isQualifyingActivityKey(ActivityKey.VIDEO_GENERATED)).toBe(
      true,
    );
    expect(service.isQualifyingActivityKey(ActivityKey.CREDITS_ADD)).toBe(
      false,
    );
  });
});
