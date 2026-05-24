import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { CreditsUtilsService as CreditsUtilsServiceToken } from '@api/collections/credits/services/credits.utils.service';
import type {
  StreakDocument,
  StreakMilestoneHistoryEntry,
} from '@api/collections/streaks/schemas/streak.schema';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityKey } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function serializeDate(value?: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

@Injectable()
export class StreaksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => CreditsUtilsServiceToken))
    private readonly creditsUtilsService: CreditsUtilsServiceContract,
    private readonly notificationsService: NotificationsService,
  ) {}

  private normalizeStreakRecord(
    record: Record<string, unknown>,
  ): StreakDocument {
    const data = isPlainObject(record.data) ? record.data : {};
    const merged = { ...record, ...data };
    const milestones = Array.isArray(merged.milestones)
      ? merged.milestones.filter(
          (milestone): milestone is number => typeof milestone === 'number',
        )
      : [];
    const milestoneHistory = Array.isArray(merged.milestoneHistory)
      ? merged.milestoneHistory.flatMap((entry) => {
          if (
            !isPlainObject(entry) ||
            typeof entry.milestone !== 'number' ||
            typeof entry.reward !== 'string'
          ) {
            return [];
          }

          const achievedAt = toDate(entry.achievedAt) ?? entry.achievedAt;

          if (!(achievedAt instanceof Date) && typeof achievedAt !== 'string') {
            return [];
          }

          return [
            {
              achievedAt,
              milestone: entry.milestone,
              reward: entry.reward,
            } satisfies StreakMilestoneHistoryEntry,
          ];
        })
      : [];

    return {
      ...(record as unknown as StreakDocument),
      _id:
        typeof record.mongoId === 'string' && record.mongoId.length > 0
          ? record.mongoId
          : String(record.id ?? ''),
      currentStreak:
        typeof merged.currentStreak === 'number' ? merged.currentStreak : 0,
      data,
      lastActivityDate: toDate(merged.lastActivityDate),
      lastBrokenAt: toDate(merged.lastBrokenAt),
      lastBrokenStreak:
        typeof merged.lastBrokenStreak === 'number'
          ? merged.lastBrokenStreak
          : null,
      lastFreezeUsedAt: toDate(merged.lastFreezeUsedAt),
      longestStreak:
        typeof merged.longestStreak === 'number' ? merged.longestStreak : 0,
      milestoneHistory,
      milestones,
      organization:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : undefined,
      streakFreezes:
        typeof merged.streakFreezes === 'number' ? merged.streakFreezes : 0,
      streakStartDate: toDate(merged.streakStartDate),
      totalContentDays:
        typeof merged.totalContentDays === 'number'
          ? merged.totalContentDays
          : 0,
      user: typeof record.userId === 'string' ? record.userId : undefined,
    };
  }

  private serializeStreakData(
    streak: Pick<
      StreakDocument,
      | 'currentStreak'
      | 'lastActivityDate'
      | 'lastBrokenAt'
      | 'lastBrokenStreak'
      | 'lastFreezeUsedAt'
      | 'longestStreak'
      | 'milestoneHistory'
      | 'milestones'
      | 'streakFreezes'
      | 'streakStartDate'
      | 'totalContentDays'
    >,
  ): Prisma.InputJsonValue {
    return {
      currentStreak: streak.currentStreak,
      lastActivityDate: serializeDate(streak.lastActivityDate),
      lastBrokenAt: serializeDate(streak.lastBrokenAt),
      lastBrokenStreak: streak.lastBrokenStreak ?? null,
      lastFreezeUsedAt: serializeDate(streak.lastFreezeUsedAt),
      longestStreak: streak.longestStreak,
      milestoneHistory: (streak.milestoneHistory ?? []).map((entry) => ({
        achievedAt: serializeDate(entry.achievedAt),
        milestone: entry.milestone,
        reward: entry.reward,
      })),
      milestones: streak.milestones ?? [],
      streakFreezes: streak.streakFreezes,
      streakStartDate: serializeDate(streak.streakStartDate),
      totalContentDays: streak.totalContentDays,
    } as Prisma.InputJsonValue;
  }

  private async createStreak(
    userId: string,
    organizationId: string,
    streak: Pick<
      StreakDocument,
      | 'currentStreak'
      | 'lastActivityDate'
      | 'lastBrokenAt'
      | 'lastBrokenStreak'
      | 'lastFreezeUsedAt'
      | 'longestStreak'
      | 'milestoneHistory'
      | 'milestones'
      | 'streakFreezes'
      | 'streakStartDate'
      | 'totalContentDays'
    >,
  ): Promise<StreakDocument> {
    const created = await this.prisma.streak.create({
      data: {
        data: this.serializeStreakData(streak),
        isDeleted: false,
        organizationId,
        userId,
      },
    });

    return this.normalizeStreakRecord(created as Record<string, unknown>);
  }

  private async persistStreak(streak: StreakDocument): Promise<StreakDocument> {
    const updated = await this.prisma.streak.update({
      data: {
        data: this.serializeStreakData(streak),
      },
      where: { id: streak.id },
    });

    return this.normalizeStreakRecord(updated as Record<string, unknown>);
  }

  private async listStreaks(): Promise<StreakDocument[]> {
    const streaks = await this.prisma.streak.findMany({
      where: { isDeleted: false },
    });

    return streaks.map((streak) =>
      this.normalizeStreakRecord(streak as Record<string, unknown>),
    );
  }

  isQualifyingActivityKey(key?: string | null): key is ActivityKey {
    return QUALIFYING_ACTIVITY_KEYS.has(key as ActivityKey);
  }

  async getStreak(
    userId: string,
    organizationId: string,
  ): Promise<StreakDocument | null> {
    const result = await this.prisma.streak.findFirst({
      where: { isDeleted: false, organizationId, userId },
    });
    return result
      ? this.normalizeStreakRecord(result as Record<string, unknown>)
      : null;
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

    let streakData: Record<string, unknown>;

    if (!streak) {
      streak = await this.createStreak(userId, organizationId, {
        currentStreak: 1,
        lastActivityDate: today,
        lastBrokenAt: null,
        lastBrokenStreak: null,
        lastFreezeUsedAt: null,
        longestStreak: 1,
        milestoneHistory: [],
        milestones: [],
        streakFreezes: 0,
        streakStartDate: today,
        totalContentDays: 1,
      });
      streakData = { ...streak };
    } else {
      const lastActivityDate = streak.lastActivityDate
        ? startOfUtcDay(new Date(streak.lastActivityDate))
        : null;

      if (lastActivityDate && lastActivityDate.getTime() === today.getTime()) {
        return { newMilestones: [], streak };
      }

      let newCurrentStreak = streak.currentStreak;
      let newStreakStartDate = streak.streakStartDate;

      if (
        lastActivityDate &&
        lastActivityDate.getTime() === yesterday.getTime()
      ) {
        newCurrentStreak += 1;
      } else {
        newCurrentStreak = 1;
        newStreakStartDate = today;
      }

      const newTotalContentDays = streak.totalContentDays + 1;
      const newLongestStreak = Math.max(streak.longestStreak, newCurrentStreak);

      // Determine new milestones
      const existingMilestones = streak.milestones ?? [];
      const newMilestonesLocal = STREAK_MILESTONES.filter(
        (milestone) =>
          newCurrentStreak >= milestone.days &&
          !existingMilestones.includes(milestone.days),
      );

      const updatedMilestones = [
        ...(streak.milestones ?? []),
        ...newMilestonesLocal.map((m) => m.days),
      ];
      const updatedMilestoneHistory = [
        ...(streak.milestoneHistory ?? []),
        ...newMilestonesLocal.map((m) => ({
          achievedAt: today,
          milestone: m.days,
          reward: m.rewardLabel,
        })),
      ];
      const extraFreezes = newMilestonesLocal.filter(
        (m) => m.days === 7,
      ).length;
      const newStreakFreezes = streak.streakFreezes + extraFreezes;

      streak.currentStreak = newCurrentStreak;
      streak.lastActivityDate = today;
      streak.longestStreak = newLongestStreak;
      streak.milestoneHistory = updatedMilestoneHistory;
      streak.milestones = updatedMilestones;
      streak.streakFreezes = newStreakFreezes;
      streak.streakStartDate = newStreakStartDate;
      streak.totalContentDays = newTotalContentDays;
      streak = await this.persistStreak(streak);
      streakData = { ...streak };

      const newMilestones = newMilestonesLocal;

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

    const newMilestones = STREAK_MILESTONES.filter(
      (milestone) =>
        (streakData.currentStreak as number) >= milestone.days &&
        !((streakData.milestones as number[]) ?? []).includes(milestone.days),
    );

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
    let streak = await this.getStreak(userId, organizationId);

    if (!streak) {
      throw new NotFoundException('Streak not found');
    }

    if (streak.streakFreezes <= 0) {
      throw new BadRequestException('No streak freezes available.');
    }

    streak.lastActivityDate = startOfUtcDay(new Date());
    streak.lastFreezeUsedAt = new Date();
    streak.streakFreezes -= 1;
    streak = await this.persistStreak(streak);

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

    const allStreaks = await this.listStreaks();
    const atRiskStreaks = allStreaks.filter((streak) => {
      const lastActivityDate = streak.lastActivityDate
        ? startOfUtcDay(new Date(streak.lastActivityDate))
        : null;

      return (
        streak.currentStreak >= 3 &&
        lastActivityDate?.getTime() === yesterday.getTime()
      );
    });

    for (const streak of atRiskStreaks) {
      await this.sendDiscordNotification(
        'streak_at_risk',
        `Your ${streak.currentStreak}-day streak is at risk. Create content today to keep it alive.`,
        String(streak.organization),
        String(streak.user),
      );
    }

    const staleStreaks = allStreaks.filter((streak) => {
      if (streak.currentStreak <= 0) {
        return false;
      }

      const lastActivityDate = streak.lastActivityDate
        ? startOfUtcDay(new Date(streak.lastActivityDate))
        : null;

      return (
        !lastActivityDate || lastActivityDate.getTime() < yesterday.getTime()
      );
    });

    let broken = 0;
    let frozen = 0;

    for (const streak of staleStreaks) {
      const streakOrg = String(streak.organization ?? '');
      const streakUser = String(streak.user ?? '');
      const streakCurrentStreak = streak.currentStreak;

      if (streak.streakFreezes > 0) {
        streak.lastActivityDate = yesterday;
        streak.lastFreezeUsedAt = today;
        streak.streakFreezes -= 1;
        await this.persistStreak(streak);
        frozen += 1;

        await this.sendDiscordNotification(
          'streak_freeze_used',
          `A streak freeze protected a ${streakCurrentStreak}-day streak.`,
          streakOrg,
          streakUser,
        );
        continue;
      }

      const brokenStreakLength = streakCurrentStreak;
      streak.currentStreak = 0;
      streak.lastBrokenAt = today;
      streak.lastBrokenStreak = brokenStreakLength;
      streak.streakStartDate = null;
      await this.persistStreak(streak);
      broken += 1;

      await this.sendDiscordNotification(
        'streak_broken',
        `A ${brokenStreakLength}-day streak was broken. Start a new one today.`,
        streakOrg,
        streakUser,
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

    const docs = await this.prisma.activity.findMany({
      select: { createdAt: true, key: true },
      where: {
        createdAt: {
          gte: rangeStart,
          lt: addUtcDays(rangeEnd, 1),
        },
        isDeleted: false,
        key: { in: Array.from(QUALIFYING_ACTIVITY_KEYS) },
        organizationId,
        userId,
      } as never,
    });

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
    milestoneHistory: StreakMilestoneHistoryEntry[],
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
