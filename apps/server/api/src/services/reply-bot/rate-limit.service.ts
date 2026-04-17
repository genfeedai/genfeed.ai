import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  remainingHourly?: number;
  remainingDaily?: number;
  resetTime?: Date;
}

interface RateLimitCounter {
  hourly: number;
  daily: number;
  lastHourReset: Date;
  lastDayReset: Date;
}

interface ReplyBotConfigData {
  isActive?: boolean;
  rateLimits?: {
    maxRepliesPerHour?: number;
    maxRepliesPerDay?: number;
    cooldownMinutes?: number;
  };
  schedule?: {
    enabled?: boolean;
    activeDays?: string[];
    activeHoursStart?: string;
    activeHoursEnd?: string;
  };
}

@Injectable()
export class RateLimitService {
  private readonly constructorName: string = String(this.constructor.name);

  // In-memory rate limit counters (keyed by botConfigId)
  // For production, consider using Redis for distributed rate limiting
  private counters: Map<string, RateLimitCounter> = new Map();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Check if a bot is within its rate limits
   */
  async checkRateLimit(
    botConfigId: string,
    organizationId: string,
  ): Promise<RateLimitCheck> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get the bot config to check rate limits
      const record = await this.prisma.replyBotConfig.findFirst({
        where: {
          id: botConfigId,
          isDeleted: false,
          organizationId,
        },
      });

      if (!record) {
        return {
          allowed: false,
          reason: 'Bot configuration not found',
        };
      }

      const botConfig = (record.config ?? {}) as ReplyBotConfigData;

      if (!botConfig.isActive) {
        return {
          allowed: false,
          reason: 'Bot is paused',
        };
      }

      // Get or initialize counter for this bot
      let counter = this.counters.get(botConfigId);

      if (!counter) {
        counter = this.initializeCounter();
        this.counters.set(botConfigId, counter);
      }

      // Reset counters if time periods have elapsed
      this.resetCountersIfNeeded(counter);

      // Check rate limits
      const maxHourly = botConfig.rateLimits?.maxRepliesPerHour || 10;
      const maxDaily = botConfig.rateLimits?.maxRepliesPerDay || 50;

      if (counter.hourly >= maxHourly) {
        const resetTime = new Date(
          counter.lastHourReset.getTime() + 60 * 60 * 1000,
        );
        return {
          allowed: false,
          reason: 'Hourly rate limit exceeded',
          remainingDaily: Math.max(0, maxDaily - counter.daily),
          remainingHourly: 0,
          resetTime,
        };
      }

      if (counter.daily >= maxDaily) {
        const resetTime = new Date(
          counter.lastDayReset.getTime() + 24 * 60 * 60 * 1000,
        );
        return {
          allowed: false,
          reason: 'Daily rate limit exceeded',
          remainingDaily: 0,
          remainingHourly: Math.max(0, maxHourly - counter.hourly),
          resetTime,
        };
      }

      return {
        allowed: true,
        remainingDaily: maxDaily - counter.daily - 1,
        remainingHourly: maxHourly - counter.hourly - 1,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      // Default to not allowed on error to prevent rate limit bypass
      return {
        allowed: false,
        reason: 'Rate limit check failed',
      };
    }
  }

  /**
   * Increment the rate limit counter after a successful action
   */
  incrementCounter(botConfigId: string): void {
    let counter = this.counters.get(botConfigId);

    if (!counter) {
      counter = this.initializeCounter();
      this.counters.set(botConfigId, counter);
    }

    // Reset counters if needed before incrementing
    this.resetCountersIfNeeded(counter);

    counter.hourly++;
    counter.daily++;

    this.loggerService.log(`${this.constructorName} incrementCounter`, {
      botConfigId,
      daily: counter.daily,
      hourly: counter.hourly,
    });
  }

  /**
   * Get current usage stats for a bot
   */
  async getUsageStats(
    botConfigId: string,
    organizationId: string,
  ): Promise<{
    hourlyUsed: number;
    hourlyLimit: number;
    dailyUsed: number;
    dailyLimit: number;
    hourlyResetAt: Date;
    dailyResetAt: Date;
  } | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const record = await this.prisma.replyBotConfig.findFirst({
        where: {
          id: botConfigId,
          isDeleted: false,
          organizationId,
        },
      });

      if (!record) {
        return null;
      }

      const botConfig = (record.config ?? {}) as ReplyBotConfigData;

      let counter = this.counters.get(botConfigId);

      if (!counter) {
        counter = this.initializeCounter();
        this.counters.set(botConfigId, counter);
      }

      this.resetCountersIfNeeded(counter);

      const maxHourly = botConfig.rateLimits?.maxRepliesPerHour || 10;
      const maxDaily = botConfig.rateLimits?.maxRepliesPerDay || 50;

      return {
        dailyLimit: maxDaily,
        dailyResetAt: new Date(
          counter.lastDayReset.getTime() + 24 * 60 * 60 * 1000,
        ),
        dailyUsed: counter.daily,
        hourlyLimit: maxHourly,
        hourlyResetAt: new Date(
          counter.lastHourReset.getTime() + 60 * 60 * 1000,
        ),
        hourlyUsed: counter.hourly,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return null;
    }
  }

  /**
   * Check if current time is within the bot's active schedule
   */
  isWithinSchedule(botConfig: ReplyBotConfigData): boolean {
    if (!botConfig.schedule?.enabled) {
      return true; // No schedule means always active
    }

    const now = new Date();
    const currentDay = now
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    // Check if current day is active
    const activeDays = botConfig.schedule.activeDays || [];
    if (activeDays.length > 0 && !activeDays.includes(currentDay)) {
      return false;
    }

    // Check if current time is within active hours
    if (
      botConfig.schedule.activeHoursStart &&
      botConfig.schedule.activeHoursEnd
    ) {
      const [startHour, startMin] = botConfig.schedule.activeHoursStart
        .split(':')
        .map(Number);
      const [endHour, endMin] = botConfig.schedule.activeHoursEnd
        .split(':')
        .map(Number);

      const startTimeMinutes = startHour * 60 + startMin;
      const endTimeMinutes = endHour * 60 + endMin;

      // Handle overnight schedules (e.g., 22:00 to 06:00)
      if (startTimeMinutes > endTimeMinutes) {
        return (
          currentTimeMinutes >= startTimeMinutes ||
          currentTimeMinutes < endTimeMinutes
        );
      } else {
        return (
          currentTimeMinutes >= startTimeMinutes &&
          currentTimeMinutes < endTimeMinutes
        );
      }
    }

    return true;
  }

  /**
   * Check cooldown between replies to same user
   */
  async checkCooldown(
    botConfigId: string,
    _targetUserId: string,
    lastReplyTime: Date,
  ): Promise<{ allowed: boolean; remainingSeconds?: number }> {
    const record = await this.prisma.replyBotConfig.findFirst({
      where: { id: botConfigId, isDeleted: false },
    });

    if (!record) {
      return { allowed: false };
    }

    const botConfig = (record.config ?? {}) as ReplyBotConfigData;
    const cooldownMinutes = botConfig.rateLimits?.cooldownMinutes ?? 60;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const timeSinceLastReply = Date.now() - lastReplyTime.getTime();

    if (timeSinceLastReply < cooldownMs) {
      const remainingMs = cooldownMs - timeSinceLastReply;
      return {
        allowed: false,
        remainingSeconds: Math.ceil(remainingMs / 1000),
      };
    }

    return { allowed: true };
  }

  /**
   * Initialize a new counter
   */
  private initializeCounter(): RateLimitCounter {
    const now = new Date();
    return {
      daily: 0,
      hourly: 0,
      lastDayReset: now,
      lastHourReset: now,
    };
  }

  /**
   * Reset counters if time periods have elapsed
   */
  private resetCountersIfNeeded(counter: RateLimitCounter): void {
    const now = new Date();

    // Reset hourly counter if an hour has passed
    const hoursSinceReset =
      (now.getTime() - counter.lastHourReset.getTime()) / (60 * 60 * 1000);
    if (hoursSinceReset >= 1) {
      counter.hourly = 0;
      counter.lastHourReset = now;
    }

    // Reset daily counter if a day has passed
    const daysSinceReset =
      (now.getTime() - counter.lastDayReset.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceReset >= 1) {
      counter.daily = 0;
      counter.lastDayReset = now;
    }
  }

  /**
   * Clear all counters (useful for testing or admin reset)
   */
  clearAllCounters(): void {
    this.counters.clear();
    this.loggerService.log(`${this.constructorName} clearAllCounters`, {
      message: 'All rate limit counters cleared',
    });
  }

  /**
   * Clear counter for a specific bot
   */
  clearBotCounter(botConfigId: string): void {
    this.counters.delete(botConfigId);
    this.loggerService.log(`${this.constructorName} clearBotCounter`, {
      botConfigId,
    });
  }
}
