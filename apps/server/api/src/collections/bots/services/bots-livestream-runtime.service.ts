import { Injectable } from '@nestjs/common';

export type LivestreamPlatform = 'twitch' | 'youtube';

export interface ResolvedLivestreamContext {
  currentTopic?: string;
  promotionAngle?: string;
  source: 'manual_override' | 'transcript' | 'none';
  transcriptConfidence?: number;
  transcriptSummary?: string;
}

export interface LivestreamPlatformState {
  platform: LivestreamPlatform;
  lastPostedAt?: Date;
  hourWindowStartedAt?: Date;
  hourlyPostCount: number;
}

export interface LivestreamDeliveryEligibility {
  allowed: boolean;
  reason?: 'cooldown' | 'hourly_cap';
}

export interface LivestreamMessageTemplate {
  enabled: boolean;
  id: string;
  platforms?: LivestreamPlatform[];
  text: string;
  type:
    | 'scheduled_link_drop'
    | 'scheduled_host_prompt'
    | 'context_aware_question';
}

export interface LivestreamContextState {
  currentTopic?: string;
  promotionAngle?: string;
}

@Injectable()
export class BotsLivestreamRuntimeService {
  private static readonly MINIMUM_CONFIDENCE = 0.5;

  resolveContextState(
    context: {
      currentTopic?: string;
      manualOverride?: {
        topic?: string;
        promotionAngle?: string;
        expiresAt?: Date;
      };
      transcriptConfidence?: number;
      transcriptSummary?: string;
    },
    now: Date,
  ): ResolvedLivestreamContext {
    const hasActiveOverride =
      context.manualOverride &&
      (!context.manualOverride.expiresAt ||
        context.manualOverride.expiresAt.getTime() > now.getTime()) &&
      (context.manualOverride.topic || context.manualOverride.promotionAngle);

    if (hasActiveOverride) {
      return {
        currentTopic: context.manualOverride?.topic ?? context.currentTopic,
        promotionAngle: context.manualOverride?.promotionAngle,
        source: 'manual_override',
        transcriptConfidence: context.transcriptConfidence,
        transcriptSummary: context.transcriptSummary,
      };
    }

    if (
      context.transcriptSummary &&
      (context.transcriptConfidence ?? 0) >=
        BotsLivestreamRuntimeService.MINIMUM_CONFIDENCE
    ) {
      return {
        currentTopic: context.currentTopic ?? context.transcriptSummary,
        source: 'transcript',
        transcriptConfidence: context.transcriptConfidence,
        transcriptSummary: context.transcriptSummary,
      };
    }

    return {
      source: 'none',
      transcriptConfidence: context.transcriptConfidence,
      transcriptSummary: context.transcriptSummary,
    };
  }

  getDeliveryEligibility(
    platformState: LivestreamPlatformState,
    settings: {
      minimumMessageGapSeconds: number;
      maxAutoPostsPerHour: number;
    },
    now: Date,
  ): LivestreamDeliveryEligibility {
    if (platformState.lastPostedAt) {
      const millisecondsSinceLastPost =
        now.getTime() - platformState.lastPostedAt.getTime();

      if (
        millisecondsSinceLastPost <
        settings.minimumMessageGapSeconds * 1000
      ) {
        return {
          allowed: false,
          reason: 'cooldown',
        };
      }
    }

    if (platformState.hourWindowStartedAt) {
      const millisecondsSinceHourWindowStarted =
        now.getTime() - platformState.hourWindowStartedAt.getTime();

      if (
        millisecondsSinceHourWindowStarted < 60 * 60 * 1000 &&
        platformState.hourlyPostCount >= settings.maxAutoPostsPerHour
      ) {
        return {
          allowed: false,
          reason: 'hourly_cap',
        };
      }
    }

    return { allowed: true };
  }

  buildContextAwareQuestion(
    context: ResolvedLivestreamContext | LivestreamContextState,
    templates: LivestreamMessageTemplate[],
  ): string | null {
    const topic = context.currentTopic?.trim();

    if (!topic) {
      return null;
    }

    const template = templates.find(
      (candidate) =>
        candidate.enabled && candidate.type === 'context_aware_question',
    );

    if (!template) {
      return `What do you think about ${topic}?`;
    }

    return template.text
      .replaceAll('{{topic}}', topic)
      .replaceAll('{{promotion_angle}}', context.promotionAngle?.trim() ?? '')
      .replaceAll(/\s+/g, ' ')
      .trim();
  }
}
