import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type {
  IAgentCampaignContentRotation,
  IAgentCampaignRotationTarget,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

export interface ContentRotationSelection {
  actualShare: number;
  key: string;
  label?: string;
  platform?: string;
  recentCount: number;
  score: number;
  targetShare: number;
  topic?: string;
}

export interface ContentRotationResult {
  selectedStrategies: AgentStrategyDocument[];
  selection?: ContentRotationSelection;
}

interface TargetScore {
  actualShare: number;
  eligibleStrategies: AgentStrategyDocument[];
  recentCount: number;
  score: number;
  target: IAgentCampaignRotationTarget;
  targetShare: number;
}

const DEFAULT_ROTATION_LOOKBACK_DAYS = 14;

@Injectable()
export class ContentRotationService {
  selectStrategies(input: {
    config?: IAgentCampaignContentRotation | null;
    recentRuns: AgentRunDocument[];
    strategies: AgentStrategyDocument[];
  }): ContentRotationResult {
    const validTargets = this.normalizeTargets(input.config);
    if (validTargets.length === 0 || input.strategies.length === 0) {
      return { selectedStrategies: input.strategies };
    }

    const totalWeight = validTargets.reduce(
      (sum, target) => sum + target.weight,
      0,
    );
    const recentCounts = this.countRecentTargets(input.recentRuns);
    const recentTotal = Array.from(recentCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    const scoredTargets = validTargets
      .map((target): TargetScore | null => {
        const eligibleStrategies = input.strategies.filter((strategy) =>
          this.matchesTarget(strategy, target),
        );
        if (eligibleStrategies.length === 0) {
          return null;
        }

        const recentCount = recentCounts.get(target.key) ?? 0;
        const actualShare = recentTotal > 0 ? recentCount / recentTotal : 0;
        const targetShare = target.weight / totalWeight;

        return {
          actualShare,
          eligibleStrategies,
          recentCount,
          score: targetShare - actualShare,
          target,
          targetShare,
        };
      })
      .filter((target): target is TargetScore => target !== null)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.recentCount !== right.recentCount) {
          return left.recentCount - right.recentCount;
        }
        return right.target.weight - left.target.weight;
      });

    const selected = scoredTargets[0];
    if (!selected) {
      return { selectedStrategies: input.strategies };
    }

    return {
      selectedStrategies: selected.eligibleStrategies,
      selection: {
        actualShare: selected.actualShare,
        key: selected.target.key,
        label: selected.target.label,
        platform: selected.target.platform,
        recentCount: selected.recentCount,
        score: selected.score,
        targetShare: selected.targetShare,
        topic: selected.target.topic,
      },
    };
  }

  getLookbackDays(config?: IAgentCampaignContentRotation | null): number {
    return typeof config?.lookbackDays === 'number' && config.lookbackDays > 0
      ? config.lookbackDays
      : DEFAULT_ROTATION_LOOKBACK_DAYS;
  }

  private normalizeTargets(
    config?: IAgentCampaignContentRotation | null,
  ): IAgentCampaignRotationTarget[] {
    if (config?.enabled === false || !Array.isArray(config?.targets)) {
      return [];
    }

    return config.targets.filter(
      (target) =>
        typeof target.key === 'string' &&
        target.key.length > 0 &&
        typeof target.weight === 'number' &&
        Number.isFinite(target.weight) &&
        target.weight > 0,
    );
  }

  private countRecentTargets(
    recentRuns: AgentRunDocument[],
  ): Map<string, number> {
    const counts = new Map<string, number>();

    for (const run of recentRuns) {
      const metadata = this.readRunMetadata(run);
      const targetKey = this.readString(metadata.contentRotationTargetKey);
      if (!targetKey) {
        continue;
      }
      counts.set(targetKey, (counts.get(targetKey) ?? 0) + 1);
    }

    return counts;
  }

  private matchesTarget(
    strategy: AgentStrategyDocument,
    target: IAgentCampaignRotationTarget,
  ): boolean {
    const strategyId = String(strategy._id ?? strategy.id ?? '');
    if (target.strategyId && target.strategyId !== strategyId) {
      return false;
    }

    if (target.platform) {
      const platforms = new Set(
        (strategy.platforms ?? []).map((platform) => platform.toLowerCase()),
      );
      if (!platforms.has(target.platform.toLowerCase())) {
        return false;
      }
    }

    if (target.topic) {
      const topic = target.topic.toLowerCase();
      const topics = strategy.topics ?? [];
      if (
        !topics.some((strategyTopic) => strategyTopic.toLowerCase() === topic)
      ) {
        return false;
      }
    }

    return true;
  }

  private readRunMetadata(run: AgentRunDocument): Record<string, unknown> {
    const record = run as Record<string, unknown>;
    const metadata = this.readRecord(record.metadata);
    if (metadata) {
      return metadata;
    }

    const config = this.readRecord(record.config);
    return this.readRecord(config?.metadata) ?? {};
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
