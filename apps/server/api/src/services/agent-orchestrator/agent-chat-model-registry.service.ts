/**
 * Runtime agent-chat model catalogue — reads the `models` registry only.
 *
 * Seed input still lives in `@genfeedai/contracts/constants` (`AGENT_CHAT_MODELS` →
 * `UNIFIED_MODEL_CATALOG` → ModelCatalogSeedService). After seed, pickers,
 * defaults, round costs, and key resolution must not re-read that list.
 */

import { normalizeResponseModel } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import {
  AGENT_CHAT_CAPABILITY,
  AGENT_CHAT_MODEL_KEYS,
  AGENT_FALLBACK_ROUND_CREDITS,
  type AgentChatModelPricing,
  type AgentTokenUsage,
  calculateAgentExactCredits,
  calculateAgentProviderCostUsd,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  estimateAgentMessageCredits,
  getAgentChatModel,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY,
  REASONING_FEATURE,
} from '@genfeedai/contracts/constants';
import { getRuntimeMarginMultiplier } from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export interface AgentChatRegistryRow {
  cost: number;
  isActive: boolean;
  isDefault: boolean;
  isFree: boolean;
  /** Registry row advertises the reasoning feature. Tier mapping prefers these for `complex`. */
  isReasoning: boolean;
  key: string;
  label: string;
  /** Registry $/1M token list price; null when the row carries none. */
  pricing: AgentChatModelPricing | null;
  provider: string;
  succeededBy: string | null;
  lifecycle: ModelLifecycle;
  isDiscovered: boolean;
  reviewStatus: string | null;
}

const CACHE_TTL_MS = 30_000;

export interface AgentRoundPricingInput extends AgentTokenUsage {
  requestedModel: string;
  /** Model that answered, normalized to its registry key when known. */
  responseModel?: string;
}

/**
 * Prices a completed agent round. Implemented by the registry; the round
 * reservation helper settles through it.
 */
export interface AgentRoundPricer {
  calculateRoundProviderCostUsd(input: AgentRoundPricingInput): Promise<number>;
  toRoundCredits(providerCostUsd: number): number;
}

function toRowPricing(
  input: number | null,
  output: number | null,
): AgentChatModelPricing | null {
  if (
    typeof input !== 'number' ||
    typeof output !== 'number' ||
    !Number.isFinite(input) ||
    !Number.isFinite(output)
  ) {
    return null;
  }
  return { completionPerMillion: output, promptPerMillion: input };
}

function toDomainLifecycle(value: string): ModelLifecycle {
  switch (value) {
    case ModelLifecycle.RECOMMENDED:
      return ModelLifecycle.RECOMMENDED;
    case ModelLifecycle.LEGACY:
      return ModelLifecycle.LEGACY;
    case ModelLifecycle.RETIRED:
      return ModelLifecycle.RETIRED;
    default:
      return ModelLifecycle.AVAILABLE;
  }
}

@Injectable()
export class AgentChatModelRegistryService
  implements OnModuleInit, AgentRoundPricer
{
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
        inputCostPerMillionTokens: true,
        isFree: true,
        key: true,
        label: true,
        outputCostPerMillionTokens: true,
        provider: true,
        succeededBy: true,
        lifecycle: true,
        reviewStatus: true,
        supportsFeatures: true,
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
        cost: row.cost,
        isActive: row.isActive,
        isDefault: row.isDefault,
        isDiscovered: row.isDiscovered,
        isFree: row.isFree,
        isReasoning: row.supportsFeatures.includes(REASONING_FEATURE),
        key: row.key,
        label: row.label,
        pricing: toRowPricing(
          row.inputCostPerMillionTokens,
          row.outputCostPerMillionTokens,
        ),
        provider: row.provider,
        succeededBy: row.succeededBy,
        lifecycle: toDomainLifecycle(row.lifecycle),
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

  /**
   * Credits for one LLM round on `key`. A key the registry does not know bills
   * at {@link getFallbackRoundCredits} — never below a catalogued model.
   */
  async getRoundCredits(key?: string | null): Promise<number> {
    await this.ensureFresh();
    const resolved = await this.resolveModelKey(key);
    const row = this.byKey.get(resolved);
    if (row) {
      return Math.max(0, Math.round(row.cost));
    }
    return this.getFallbackRoundCredits();
  }

  /**
   * Provider USD for a completed round priced from its token usage. Used when
   * the provider does not report a charge (native Anthropic/OpenAI). The
   * answering model's list price wins; an unmapped response model (dated
   * slug, provider-side alias) prices at the requested model; a model neither
   * the registry nor the catalogue knows prices at the most expensive curated
   * rate — an unknown key is far more likely a new frontier release than a
   * bargain.
   */
  async calculateRoundProviderCostUsd(
    input: AgentRoundPricingInput,
  ): Promise<number> {
    await this.ensureFresh();
    const responseModel = normalizeResponseModel(
      input.requestedModel,
      input.responseModel,
    );
    const pricing =
      (await this.resolvePricing(responseModel)) ??
      (await this.resolvePricing(input.requestedModel)) ??
      this.getFallbackPricing();
    return calculateAgentProviderCostUsd(pricing, input);
  }

  /** Exact fractional credits: provider USD × base margin × operator knob. */
  toRoundCredits(providerCostUsd: number): number {
    return calculateAgentExactCredits(
      providerCostUsd,
      getRuntimeMarginMultiplier(),
    );
  }

  /**
   * "≈ credits per message" for every selectable model, from the average
   * message token footprint at the live margin. Display only.
   */
  async getMessageCostEstimatesMap(): Promise<Record<string, number>> {
    const selectable = await this.listSelectable();
    const marginMultiplier = getRuntimeMarginMultiplier();
    return Object.fromEntries(
      selectable.map((row) => {
        const pricing = row.isFree ? null : this.pricingForRow(row);
        return [
          row.key,
          pricing ? estimateAgentMessageCredits(pricing, marginMultiplier) : 0,
        ];
      }),
    );
  }

  private pricingForRow(
    row: AgentChatRegistryRow,
  ): AgentChatModelPricing | null {
    return row.pricing ?? getAgentChatModel(row.key)?.pricing ?? null;
  }

  private async resolvePricing(
    key?: string | null,
  ): Promise<AgentChatModelPricing | null> {
    if (!key?.trim()) {
      return null;
    }
    const resolved = await this.resolveModelKey(key);
    const row = this.byKey.get(resolved);
    if (row) {
      return this.pricingForRow(row);
    }
    return getAgentChatModel(resolved)?.pricing ?? null;
  }

  /** Highest curated prompt and completion rates, taken independently. */
  private getFallbackPricing(): AgentChatModelPricing {
    const curated = [...this.byKey.values()]
      .filter(
        (row) =>
          row.isActive &&
          row.lifecycle !== ModelLifecycle.RETIRED &&
          (!row.isDiscovered || row.reviewStatus === 'approved'),
      )
      .map((row) => this.pricingForRow(row))
      .filter((pricing): pricing is AgentChatModelPricing => pricing !== null);
    return {
      completionPerMillion: Math.max(
        0,
        ...curated.map((pricing) => pricing.completionPerMillion),
      ),
      promptPerMillion: Math.max(
        0,
        ...curated.map((pricing) => pricing.promptPerMillion),
      ),
    };
  }

  /**
   * Unknown-model round cost: the priciest curated registry row, floored at the
   * contract's {@link AGENT_FALLBACK_ROUND_CREDITS}. An unknown key is far more
   * likely a new frontier release than a bargain.
   */
  private getFallbackRoundCredits(): number {
    const curatedCosts = [...this.byKey.values()]
      .filter(
        (row) =>
          row.isActive &&
          row.lifecycle !== ModelLifecycle.RETIRED &&
          (!row.isDiscovered || row.reviewStatus === 'approved'),
      )
      .map((row) => Math.round(row.cost));
    return Math.max(AGENT_FALLBACK_ROUND_CREDITS, ...curatedCosts);
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
    return (await this.listAutoCandidates()).map((row) => row.key).sort();
  }

  /**
   * The rows behind `getAutoAllowedModelKeys()` (#4865).
   *
   * Tier mapping needs cost and `isReasoning`, not just keys, and it must read
   * the same eligibility filter the gateway's `allowed_models` list is built
   * from — otherwise Genfeed could dispatch a key the auto-router would never
   * have been allowed to pick.
   */
  async listAutoCandidates(): Promise<AgentChatRegistryRow[]> {
    await this.ensureFresh();
    return [...this.byKey.values()].filter((row) => this.isAutoEligible(row));
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
