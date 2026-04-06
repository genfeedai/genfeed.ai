import {
  Activity,
  type ActivityDocument,
} from '@api/collections/activities/schemas/activity.schema';
import { CreditsUtilsService as CreditsUtilsServiceToken } from '@api/collections/credits/services/credits.utils.service';
import {
  Streak,
  type StreakDocument,
} from '@api/collections/streaks/schemas/streak.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ActivityKey } from '@genfeedai/enums';
import {
  IStreakCalendarResponse,
  type IStreakMilestoneDefinition,
  type IStreakMilestoneState,
  type IStreakSummary,
  STREAK_MILESTONES,
} from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

const QUALIFYING_ACTIVITY_KEYS = new Set<ActivityKey>([
  ActivityKey.ARTICLE_GENERATED,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.VIDEO_GENERATED,
]);

const BONUS_EXPIRATION_DAYS = 90;

type CreditsUtilsServiceContract = Pick<
  CreditsUtilsServiceToken,
  'addOrganizationCreditsWithExpiration'
>;

function startOfUtcDay(input: Date): Date {
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
  );
}

function addUtcDays(input: Date, days: number): Date {
  const date = new Date(input);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function isWithinDays(input: Date, referenceDate: Date, days: number): boolean {
  const threshold = addUtcDays(startOfUtcDay(referenceDate), -days);
  return startOfUtcDay(input).getTime() >= threshold.getTime();
}

function toTypeLabel(key: ActivityKey): string {
  switch (key) {
    case ActivityKey.ARTICLE_GENERATED:
      return 'article';
    case ActivityKey.IMAGE_GENERATED:
      return 'image';
    case ActivityKey.POST_PUBLISHED:
      return 'post';
    case ActivityKey.VIDEO_GENERATED:
      return 'video';
    default:
      return 'content';
  }
}

@Injectable()
export class StreaksService {
  constructor(
    @InjectModel(Streak.name, DB_CONNECTIONS.CLOUD)
    private readonly model: AggregatePaginateModel<StreakDocument>,
    @InjectModel(Activity.name, DB_CONNECTIONS.CLOUD)
    private readonly activityModel: AggregatePaginateModel<ActivityDocument>,
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => CreditsUtilsServiceToken))
    private readonly creditsUtilsService: CreditsUtilsServiceContract,
    private readonly notificationsService: NotificationsService,
  ) {}

  isQualifyingActivityKey(key?: string | null): key is ActivityKey {
    return QUALIFYING_ACTIVITY_KEYS.has(key as ActivityKey);
  }

  async getStreak(
    userId: string,
    organizationId: string,
  ): Promise<StreakDocument | null> {
    return this.model
      .findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        user: new Types.ObjectId(userId),
      })
      .exec();
  }

  async getStreakSummary(
    userId: string,
    organizationId: string,
  ): Promise<IStreakSummary> {
    const streak = await this.getStreak(userId, organizationId);

    const fallbackMilestoneStates = this.buildMilestoneStates([], []);
    const fallback: IStreakSummary = {
      badgeMilestones: [],
      currentStreak: 0,
      id: '',
      lastActivityDate: null,
      lastBrokenAt: null,
      lastBrokenStreak: null,
      lastFreezeUsedAt: null,
      longestStreak: 0,
      milestoneHistory: [],
      milestoneStates: fallbackMilestoneStates,
      milestones: [],
      nextMilestone: this.getNextMilestone(0),
      status: 'idle',
      streakFreezes: 0,
      streakStartDate: null,
      totalContentDays: 0,
    };

    if (!streak) {
      return fallback;
    }

    const milestoneStates = this.buildMilestoneStates(
      streak.milestones ?? [],
      streak.milestoneHistory ?? [],
    );

    return {
      badgeMilestones: (streak.milestones ?? []).filter(
        (milestone) => milestone >= 30,
      ),
      currentStreak: streak.currentStreak,
      id: String(streak._id),
      lastActivityDate: streak.lastActivityDate ?? null,
      lastBrokenAt: streak.lastBrokenAt ?? null,
      lastBrokenStreak: streak.lastBrokenStreak ?? null,
      lastFreezeUsedAt: streak.lastFreezeUsedAt ?? null,
      longestStreak: streak.longestStreak,
      milestoneHistory: streak.milestoneHistory ?? [],
      milestoneStates,
      milestones: streak.milestones ?? [],
      nextMilestone: this.getNextMilestone(streak.currentStreak),
      status: this.getStatus(streak),
      streakFreezes: streak.streakFreezes,
      streakStartDate: streak.streakStartDate ?? null,
      totalContentDays: streak.totalContentDays,
    };
  }

  async checkAndUpdate(
    userId: string,
    organizationId: string,
    activityDate: Date = new Date(),
  ): Promise<{ streak: StreakDocument; newMilestones: number[] }> {
    const today = startOfUtcDay(activityDate);
    const yesterday = addUtcDays(today, -1);

    let streak = await this.getStreak(userId, organizationId);

    if (!streak) {
      streak = await this.model.create({
        currentStreak: 1,
        lastActivityDate: today,
        lastBrokenAt: null,
        lastBrokenStreak: null,
        lastFreezeUsedAt: null,
        longestStreak: 1,
        milestoneHistory: [],
        milestones: [],
        organization: new Types.ObjectId(organizationId),
        streakFreezes: 0,
        streakStartDate: today,
        totalContentDays: 1,
        user: new Types.ObjectId(userId),
      });
    } else {
      const lastActivityDate = streak.lastActivityDate
        ? startOfUtcDay(new Date(streak.lastActivityDate))
        : null;

      if (lastActivityDate && lastActivityDate.getTime() === today.getTime()) {
        return { newMilestones: [], streak };
      }

      if (
        lastActivityDate &&
        lastActivityDate.getTime() === yesterday.getTime()
      ) {
        streak.currentStreak += 1;
      } else {
        streak.currentStreak = 1;
        streak.streakStartDate = today;
      }

      streak.lastActivityDate = today;
      streak.totalContentDays += 1;
      streak.longestStreak = Math.max(
        streak.longestStreak,
        streak.currentStreak,
      );
    }

    const newMilestones = STREAK_MILESTONES.filter(
      (milestone) =>
        streak.currentStreak >= milestone.days &&
        !streak.milestones.includes(milestone.days),
    );

    if (newMilestones.length > 0) {
      for (const milestone of newMilestones) {
        streak.milestones.push(milestone.days);
        streak.milestoneHistory.push({
          achievedAt: today,
          milestone: milestone.days,
          reward: milestone.rewardLabel,
        });

        if (milestone.days === 7) {
          streak.streakFreezes += 1;
        }
      }
    }

    await streak.save();
    await this.handleMilestoneRewards(
      streak,
      organizationId,
      userId,
      newMilestones,
    );

    return {
      newMilestones: newMilestones.map((milestone) => milestone.days),
      streak,
    };
  }

  async useFreeze(
    userId: string,
    organizationId: string,
  ): Promise<StreakDocument> {
    const streak = await this.getStreak(userId, organizationId);

    if (!streak) {
      throw new NotFoundException('Streak not found');
    }

    if (streak.streakFreezes <= 0) {
      throw new BadRequestException('No streak freezes available.');
    }

    streak.streakFreezes -= 1;
    streak.lastActivityDate = startOfUtcDay(new Date());
    streak.lastFreezeUsedAt = new Date();
    await streak.save();

    await this.sendDiscordNotification(
      'streak_freeze_used',
      `A streak freeze was used to protect a ${streak.currentStreak}-day streak.`,
      organizationId,
      userId,
    );

    return streak;
  }

  async processStaleStreaks(referenceDate: Date = new Date()): Promise<{
    broken: number;
    frozen: number;
    atRisk: number;
  }> {
    const today = startOfUtcDay(referenceDate);
    const yesterday = addUtcDays(today, -1);

    const atRiskStreaks = await this.model
      .find({
        currentStreak: { $gte: 3 },
        isDeleted: false,
        lastActivityDate: yesterday,
      })
      .exec();

    for (const streak of atRiskStreaks) {
      await this.sendDiscordNotification(
        'streak_at_risk',
        `Your ${streak.currentStreak}-day streak is at risk. Create content today to keep it alive.`,
        String(streak.organization),
        String(streak.user),
      );
    }

    const staleStreaks = await this.model
      .find({
        currentStreak: { $gt: 0 },
        isDeleted: false,
        lastActivityDate: { $lt: yesterday },
      })
      .exec();

    let broken = 0;
    let frozen = 0;

    for (const streak of staleStreaks) {
      if (streak.streakFreezes > 0) {
        streak.streakFreezes -= 1;
        streak.lastActivityDate = yesterday;
        streak.lastFreezeUsedAt = today;
        await streak.save();
        frozen += 1;

        await this.sendDiscordNotification(
          'streak_freeze_used',
          `A streak freeze protected a ${streak.currentStreak}-day streak.`,
          String(streak.organization),
          String(streak.user),
        );
        continue;
      }

      const brokenStreakLength = streak.currentStreak;
      streak.lastBrokenAt = today;
      streak.lastBrokenStreak = brokenStreakLength;
      streak.currentStreak = 0;
      streak.streakStartDate = null;
      await streak.save();
      broken += 1;

      await this.sendDiscordNotification(
        'streak_broken',
        `A ${brokenStreakLength}-day streak was broken. Start a new one today.`,
        String(streak.organization),
        String(streak.user),
      );
    }

    return {
      atRisk: atRiskStreaks.length,
      broken,
      frozen,
    };
  }

  async getCalendar(
    userId: string,
    organizationId: string,
    from?: Date,
    to?: Date,
  ): Promise<IStreakCalendarResponse> {
    const rangeEnd = to ? startOfUtcDay(to) : startOfUtcDay(new Date());
    const rangeStart = from ? startOfUtcDay(from) : addUtcDays(rangeEnd, -89);

    const docs = await this.activityModel
      .find({
        createdAt: {
          $gte: rangeStart,
          $lt: addUtcDays(rangeEnd, 1),
        },
        isDeleted: false,
        key: { $in: Array.from(QUALIFYING_ACTIVITY_KEYS) },
        organization: new Types.ObjectId(organizationId),
        user: new Types.ObjectId(userId),
      })
      .select(['createdAt', 'key'])
      .lean()
      .exec();

    const days: IStreakCalendarResponse['days'] = {};

    for (const doc of docs) {
      const key = startOfUtcDay(
        new Date((doc as unknown as { createdAt: Date | string }).createdAt),
      )
        .toISOString()
        .slice(0, 10);
      const type = toTypeLabel(doc.key as ActivityKey);

      if (!days[key]) {
        days[key] = { count: 0, types: [] };
      }

      days[key].count += 1;
      if (!days[key].types.includes(type)) {
        days[key].types.push(type);
      }
    }

    return { days };
  }

  private getNextMilestone(currentStreak: number): {
    days: number;
    remaining: number;
    rewardCredits: number;
  } | null {
    const nextMilestone = STREAK_MILESTONES.find(
      (milestone) => milestone.days > currentStreak,
    );

    if (!nextMilestone) {
      return null;
    }

    return {
      days: nextMilestone.days,
      remaining: Math.max(nextMilestone.days - currentStreak, 0),
      rewardCredits: nextMilestone.rewardCredits,
    };
  }

  private buildMilestoneStates(
    achievedMilestones: number[],
    milestoneHistory: Array<{
      achievedAt: Date;
      milestone: number;
      reward: string;
    }>,
  ): IStreakMilestoneState[] {
    const historyMap = new Map(
      milestoneHistory.map((item) => [item.milestone, item]),
    );
    const nextMilestone = STREAK_MILESTONES.find(
      (milestone) => !achievedMilestones.includes(milestone.days),
    )?.days;

    return STREAK_MILESTONES.map((milestone) => ({
      achievedAt: historyMap.get(milestone.days)?.achievedAt ?? null,
      days: milestone.days,
      isAchieved: achievedMilestones.includes(milestone.days),
      isNext: milestone.days === nextMilestone,
      rewardCredits: milestone.rewardCredits,
      rewardLabel: milestone.rewardLabel,
    }));
  }

  private getStatus(streak: StreakDocument): IStreakSummary['status'] {
    const today = startOfUtcDay(new Date());
    const yesterday = addUtcDays(today, -1);
    const lastActivityDate = streak.lastActivityDate
      ? startOfUtcDay(new Date(streak.lastActivityDate))
      : null;

    if (
      streak.currentStreak >= 3 &&
      lastActivityDate &&
      lastActivityDate.getTime() === yesterday.getTime()
    ) {
      return 'at_risk';
    }

    if (
      streak.currentStreak === 0 &&
      streak.lastBrokenAt &&
      isWithinDays(new Date(streak.lastBrokenAt), today, 7)
    ) {
      return 'broken_recently';
    }

    if (streak.currentStreak > 0) {
      return 'active';
    }

    return 'idle';
  }

  private async handleMilestoneRewards(
    streak: StreakDocument,
    organizationId: string,
    userId: string,
    milestones: IStreakMilestoneDefinition[],
  ): Promise<void> {
    for (const milestone of milestones) {
      try {
        if (milestone.rewardCredits > 0) {
          await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
            organizationId,
            milestone.rewardCredits,
            `streak-milestone-${milestone.days}`,
            `Reward for ${milestone.days}-day content streak`,
            addUtcDays(new Date(), BONUS_EXPIRATION_DAYS),
          );
        }

        await this.sendDiscordNotification(
          'streak_milestone',
          this.buildMilestoneMessage(streak.currentStreak, milestone),
          organizationId,
          userId,
        );
      } catch (error) {
        this.logger.error('Failed to process streak milestone reward', {
          error,
          milestone: milestone.days,
          organizationId,
          userId,
        });
      }
    }
  }

  private buildMilestoneMessage(
    currentStreak: number,
    milestone: IStreakMilestoneDefinition,
  ): string {
    if (milestone.days === 7) {
      return `A ${currentStreak}-day streak unlocked a streak freeze.`;
    }

    if (milestone.rewardCredits > 0) {
      return `A ${milestone.days}-day streak earned ${milestone.rewardCredits} credits.`;
    }

    return `A ${milestone.days}-day content streak milestone was reached.`;
  }

  private async sendDiscordNotification(
    action: string,
    description: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.notificationsService.sendNotification({
      action,
      organizationId,
      payload: {
        card: {
          color: 0xf97316,
          description,
          title: 'GenFeed streak',
        },
      },
      type: 'discord',
      userId,
    });
  }
}
