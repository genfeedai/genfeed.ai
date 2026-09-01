/**
 * Runtime agent-chat model catalogue — reads the `models` registry only.
 *
 * Seed input still lives in `@genfeedai/constants` (`AGENT_CHAT_MODELS` →
 * `UNIFIED_MODEL_CATALOG` → ModelCatalogSeedService). After seed, pickers,
 * defaults, round costs, and key resolution must not re-read that list.
 */

import {
  AGENT_CHAT_CAPABILITY,
  AGENT_CHAT_MODEL_KEYS,
  AGENT_FALLBACK_ROUND_CREDITS,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY,
} from '@genfeedai/constants';
import { ModelCategory, ModelLifecycle, ModelProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export interface AgentChatRegistryRow {
  cost: number;
  isActive: boolean;
  isDefault: boolean;
  isFree: boolean;
  key: string;
  label: string;
  provider: string;
  succeededBy: string | null;
  lifecycle: ModelLifecycle;
  isDiscovered: boolean;
  reviewStatus: string | null;
}

const CACHE_TTL_MS = 30_000;

@Injectable()
export class AgentChatModelRegistryService implements OnModuleInit {
  private readonly context = { service: AgentChatModelRegistryService.name };
  private byKey = new Map<string, AgentChatRegistryRow>();
  private loadedAt = 0;
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    // tenant-scope-ignore: platform-wide model registry (organizationId null)
    const rows = await this.prisma.model.findMany({
      select: {
        cost: true,
        isActive: true,
        isDefault: true,
        isDiscovered: true,
        isFree: true,
        key: true,
        label: true,
        provider: true,
        succeededBy: true,
        lifecycle: true,
        reviewStatus: true,
      },
      where: {
        category: ModelCategory.TEXT,
        isDeleted: false,
        organizationId: null,
        OR: [
          { capabilities: { has: AGENT_CHAT_CAPABILITY } },
          { recommendedFor: { has: AGENT_CHAT_CAPABILITY } },
        ],
      },
    });

    const next = new Map<string, AgentChatRegistryRow>();
    for (const row of rows) {
      next.set(row.key, {
        cost: typeof row.cost === 'number' ? row.cost : 0,
        isActive: row.isActive,
        isDefault: row.isDefault,
        isDiscovered: row.isDiscovered,
        isFree: row.isFree,
        key: row.key,
        label: row.label,
        provider: row.provider,
        succeededBy: row.succeededBy ?? null,
        lifecycle: row.lifecycle,
        reviewStatus: row.reviewStatus,
      });
    }

    this.byKey = next;
    this.loadedAt = Date.now();

    if (next.size === 0) {
      this.logger.warn(
        'Agent chat model registry is empty — seed the model catalog',
        this.context,
      );
    }
  }

  private async ensureFresh(): Promise<void> {
    if (Date.now() - this.loadedAt < CACHE_TTL_MS && this.byKey.size > 0) {
      return;
    }
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }
    this.loadPromise = this.refresh().finally(() => {
      this.loadPromise = null;
    });
    await this.loadPromise;
  }

  /** Explicit picker rows: Recommended, Available, and Legacy. */
  async listSelectable(): Promise<AgentChatRegistryRow[]> {
    await this.ensureFresh();
    return [...this.byKey.values()]
      .filter((row) => row.isActive && row.lifecycle !== ModelLifecycle.RETIRED)
      .sort((left, right) => {
        if (left.cost !== right.cost) {
          return left.cost - right.cost;
        }
        return left.label.localeCompare(right.label);
      });
  }

  /**
   * Platform default for cloud chat. Prefers `isDefault` on an active row,
   * then cheapest active, then seed key only if the registry is empty.
   */
  async getDefaultModelKey(): Promise<string> {
    await this.ensureFresh();
    const active = [...this.byKey.values()].filter(
      (row) => row.isActive && row.lifecycle === ModelLifecycle.RECOMMENDED,
    );
    const marked = active.find((row) => row.isDefault);
    if (marked) {
      return marked.key;
    }
    const cheapest = [...active].sort((a, b) => a.cost - b.cost)[0];
    if (cheapest) {
      return cheapest.key;
    }
    this.logger.warn(
      'No active agent-chat model in registry; using seed default key',
      { ...this.context, fallback: DEFAULT_AGENT_CHAT_MODEL_KEY },
    );
    return DEFAULT_AGENT_CHAT_MODEL_KEY;
  }

  /** Self-hosted fleet default when subscription prefers local inference. */
  async getLocalDefaultModelKey(): Promise<string> {
    await this.ensureFresh();
    const local = [...this.byKey.values()].filter(
      (row) =>
        row.isActive &&
        row.lifecycle === ModelLifecycle.RECOMMENDED &&
        (row.provider === ModelProvider.GENFEED_AI ||
          row.key.startsWith('local/')),
    );
    const marked = local.find((row) => row.isDefault);
    if (marked) {
      return marked.key;
    }
    if (local[0]) {
      return local[0].key;
    }
    return LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY;
  }

  /**
   * Map persisted/request keys forward via registry `succeededBy` (legacy rows).
   * Empty → platform default.
   */
  async resolveModelKey(key?: string | null): Promise<string> {
    await this.ensureFresh();
    const trimmed = key?.trim();
    if (!trimmed) {
      return this.getDefaultModelKey();
    }

    const seen = new Set<string>();
    let current = trimmed;
    while (!seen.has(current)) {
      seen.add(current);
      const row = this.byKey.get(current);
      if (!row) {
        return current;
      }
      if (row.lifecycle === ModelLifecycle.RETIRED && row.succeededBy?.trim()) {
        current = row.succeededBy.trim();
        continue;
      }
      return current;
    }
    return this.getDefaultModelKey();
  }

  /** Credits for one LLM round on the model that answered. */
  async getRoundCredits(key?: string | null): Promise<number> {
    await this.ensureFresh();
    const resolved = await this.resolveModelKey(key);
    const row = this.byKey.get(resolved);
    if (row) {
      return Math.max(0, Math.round(row.cost));
    }
    // Unknown provider id — charge the default row's cost, never free.
    const defaultKey = await this.getDefaultModelKey();
    const defaultRow = this.byKey.get(defaultKey);
    if (defaultRow) {
      return Math.max(1, Math.round(defaultRow.cost));
    }
    return AGENT_FALLBACK_ROUND_CREDITS;
  }

  /** Maximum hold before a round. Dynamic routes reserve their paid fallback. */
  async getMaximumRoundCredits(key?: string | null): Promise<number> {
    await this.ensureFresh();
    const resolved = await this.resolveModelKey(key);
    if (resolved === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO) {
      const autoRow = this.byKey.get(resolved);
      const candidates = [...this.byKey.values()].filter((row) =>
        this.isAutoEligible(row),
      );
      return Math.max(
        AGENT_FALLBACK_ROUND_CREDITS,
        Math.max(1, Math.round(autoRow?.cost ?? 0)),
        ...candidates.map((row) => Math.max(1, Math.round(row.cost))),
      );
    }
    if (resolved === AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE) {
      return this.getRoundCredits(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH);
    }
    return this.getRoundCredits(resolved);
  }

  async getAutoAllowedModelKeys(): Promise<string[]> {
    await this.ensureFresh();
    return [...this.byKey.values()]
      .filter((row) => this.isAutoEligible(row))
      .map((row) => row.key)
      .sort();
  }

  private isAutoEligible(row: AgentChatRegistryRow): boolean {
    return (
      row.key !== AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO &&
      row.key !== AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE &&
      row.lifecycle === ModelLifecycle.RECOMMENDED &&
      row.isActive &&
      !row.isFree &&
      row.cost > 0 &&
      (!row.isDiscovered || row.reviewStatus === 'approved')
    );
  }

  async getRoundCostsMap(): Promise<Record<string, number>> {
    const selectable = await this.listSelectable();
    return Object.fromEntries(
      selectable.map((row) => [row.key, Math.max(0, Math.round(row.cost))]),
    );
  }

  async isTrustedSelectableKey(key: string): Promise<boolean> {
    await this.ensureFresh();
    const row = this.byKey.get(key.trim());
    if (!row) return false;
    const resolved = await this.resolveModelKey(row.key);
    const resolvedRow = this.byKey.get(resolved);
    return Boolean(
      resolvedRow?.isActive && resolvedRow.lifecycle !== ModelLifecycle.RETIRED,
    );
  }

  async getCheapestSelectableKey(): Promise<string> {
    const selectable = await this.listSelectable();
    return selectable[0]?.key ?? this.getDefaultModelKey();
  }
}
