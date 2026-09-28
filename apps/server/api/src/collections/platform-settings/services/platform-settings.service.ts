import { CreatePlatformSettingDto } from '@api/collections/platform-settings/dto/create-platform-setting.dto';
import { UpdatePlatformSettingDto } from '@api/collections/platform-settings/dto/update-platform-setting.dto';
import { PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS } from '@api/collections/platform-settings/platform-settings.constants';
import type { PlatformSettingDocument } from '@api/collections/platform-settings/schemas/platform-setting.schema';
import { isTypedDecisionProviderAvailable } from '@api/services/typed-decisions/typed-decision-provider.factory';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  PLATFORM_SETTING_KEY,
  parsePlatformFeatureSettings,
  parsePlatformFlags,
  TYPED_DECISION_PROVIDER_LABELS,
  UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
} from '@genfeedai/contracts/constants';
import type {
  IPlatformFeatureSettings,
  IPlatformFeatureSettingsState,
} from '@genfeedai/contracts/interfaces';
import {
  DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
  DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  setRuntimeAgentChatMarginMultiplier,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  type OnModuleInit,
} from '@nestjs/common';

export { PLATFORM_SETTING_KEY };

type InternalCreatePlatformSettingPayload = CreatePlatformSettingDto & {
  key: typeof PLATFORM_SETTING_KEY;
};

/**
 * Feature switches the operator may patch, each copied verbatim from the DTO
 * (the DTO has already validated it). The nullable and JSON columns need a
 * storage conversion and are handled apart.
 */
const PATCHABLE_FEATURE_KEYS = [
  'agentAutoRoutingDecisionMode',
  'isAgentContextCompressionEnabled',
  'isAgentTokenStreamingEnabled',
  'isEmailVerificationRequired',
  'isMediaPerceptionEnabled',
  'mediaGateVisionMode',
  'mediaPerceptionFrameCount',
  'mediaPerceptionLookbackHours',
  'mediaTextGateDecisionMode',
  'mediaTextGateMinConfidence',
  'modelDiscoveryDecisionMode',
  'modelDiscoveryMinConfidence',
  'moderationMode',
  'moderationProvider',
  'patternAnalyzerDecisionMode',
  'patternAnalyzerMinConfidence',
  'replyBotIntentDecisionMode',
  'replyBotIntentMinConfidence',
  'taskRoutingDecisionMode',
  'taskRoutingMinConfidence',
  'untrustedContentDecisionMode',
  'untrustedContentMinConfidence',
] as const satisfies readonly (keyof IPlatformFeatureSettings &
  keyof UpdatePlatformSettingDto)[];

type FeatureSettingsCacheEntry = {
  expiresAtMs: number;
  value: IPlatformFeatureSettings;
};

@Injectable()
export class PlatformSettingsService
  extends BaseService<
    PlatformSettingDocument,
    CreatePlatformSettingDto,
    UpdatePlatformSettingDto
  >
  implements OnModuleInit
{
  private featureSettingsCache: FeatureSettingsCacheEntry | undefined;
  private pendingFeatureSettings:
    | Promise<IPlatformFeatureSettingsState>
    | undefined;
  /** Bumped on every write so a read already in flight cannot cache a stale row. */
  private featureSettingsGeneration = 0;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(prisma, 'platformSetting', logger);
  }

  /**
   * Hydrate the process-scoped pricing runtimes from the persisted margin
   * multipliers on boot so API-context cost→price estimates use the
   * configured values. Generation and agent chat are hydrated independently
   * (#5172) — one failing to read never falls back to the other's default.
   * Failures are non-fatal — pricing falls back to each knob's own default.
   */
  async onModuleInit(): Promise<void> {
    try {
      const settings = await this.getSingleton();
      setRuntimeMarginMultiplier(settings.marginMultiplierGeneration);
      setRuntimeAgentChatMarginMultiplier(settings.marginMultiplierAgentChat);
      this.cacheFeatureSettings(parsePlatformFeatureSettings(settings));
    } catch (error) {
      this.logger?.warn(
        `Failed to hydrate margin multipliers on boot; using defaults ${DEFAULT_GENERATION_MARGIN_MULTIPLIER} (generation) / ${DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER} (agent chat)`,
        { error },
      );
      setRuntimeMarginMultiplier(DEFAULT_GENERATION_MARGIN_MULTIPLIER);
      setRuntimeAgentChatMarginMultiplier(DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER);
    }
  }

  /**
   * Return the singleton platform-settings row, creating it with defaults on
   * first access. Race-safe: a concurrent create loses the unique-key race and
   * re-reads the winner's row instead of surfacing a constraint error.
   */
  async getSingleton(): Promise<PlatformSettingDocument> {
    const singletonWhere = {
      isDeleted: false,
      key: PLATFORM_SETTING_KEY,
    };
    const existing = await this.findOne(singletonWhere);
    if (existing) {
      return existing;
    }

    try {
      return await this.create({
        key: PLATFORM_SETTING_KEY,
      } as InternalCreatePlatformSettingPayload);
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      ) {
        throw error;
      }

      const row = await this.findOne(singletonWhere);
      if (row) {
        return row;
      }
      throw new InternalServerErrorException(
        'Failed to initialize platform settings',
      );
    }
  }

  /**
   * The product feature switches (#5407), read through a short per-process
   * cache so hot paths (every agent tool result, every publish assessment)
   * cost one query per TTL rather than one per call.
   *
   * A write in this process replaces the cache at once; every other process
   * picks the change up within {@link PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS}
   * — no restart, no deploy. Workers sweeps call this on every tick, and the
   * TTL is shorter than any sweep interval.
   *
   * A failed read never fails the caller: it keeps the last value this
   * process read for one TTL, so a database blip neither flips a switch nor
   * becomes a query per call. Before any successful read it serves the
   * conservative unresolved profile, uncached.
   */
  async getFeatureSettings(): Promise<IPlatformFeatureSettings> {
    return (await this.getFeatureSettingsState()).settings;
  }

  /**
   * {@link getFeatureSettings} plus whether the values came from the
   * database. Before this process has ever read the row the state is
   * unresolved and carries {@link UNRESOLVED_PLATFORM_FEATURE_SETTINGS};
   * callers that must not guess (publish gates, the system-event outbox)
   * block or hold on it.
   */
  async getFeatureSettingsState(): Promise<IPlatformFeatureSettingsState> {
    const cached = this.featureSettingsCache;
    if (cached && Date.now() < cached.expiresAtMs) {
      return { isResolved: true, settings: cached.value };
    }

    this.pendingFeatureSettings ??= this.loadFeatureSettings().finally(() => {
      this.pendingFeatureSettings = undefined;
    });

    return this.pendingFeatureSettings;
  }

  private async loadFeatureSettings(): Promise<IPlatformFeatureSettingsState> {
    const generation = this.featureSettingsGeneration;
    let value: IPlatformFeatureSettings;
    try {
      value = parsePlatformFeatureSettings(await this.getSingleton());
    } catch (error: unknown) {
      const lastKnown = this.featureSettingsCache?.value;
      this.logger?.warn(
        'Failed to read platform feature settings; keeping the last known values',
        { error, hasLastKnownValues: Boolean(lastKnown) },
      );
      if (!lastKnown) {
        // Never cache a guess: the next call must retry the read rather than
        // serve the conservative profile for a whole TTL after recovery.
        return {
          isResolved: false,
          settings: UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
        };
      }
      value = lastKnown;
    }

    if (generation === this.featureSettingsGeneration) {
      this.cacheFeatureSettings(value);
    }
    return { isResolved: true, settings: value };
  }

  private cacheFeatureSettings(value: IPlatformFeatureSettings): void {
    this.featureSettingsCache = {
      expiresAtMs: Date.now() + PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS,
      value,
    };
  }

  /**
   * Apply an operator update to the singleton row and re-hydrate both
   * process-scoped pricing runtimes so the new margins take effect
   * immediately in this process. Only whitelisted fields are patched — the
   * singleton `key` and `id` can never be mutated through this path.
   */
  async updateSingleton(
    dto: UpdatePlatformSettingDto,
  ): Promise<PlatformSettingDocument> {
    this.assertTypedDecisionProviderAvailable(dto);
    this.assertModerationProviderAvailable(dto);

    const current = await this.getSingleton();
    const patchData: Prisma.PlatformSettingUpdateInput = {
      ...(dto.marginMultiplierGeneration === undefined
        ? {}
        : { marginMultiplierGeneration: dto.marginMultiplierGeneration }),
      ...(dto.marginMultiplierAgentChat === undefined
        ? {}
        : { marginMultiplierAgentChat: dto.marginMultiplierAgentChat }),
      ...(dto.marginInputMode === undefined
        ? {}
        : { marginInputMode: dto.marginInputMode }),
      ...(dto.typedDecisionProvider === undefined
        ? {}
        : { typedDecisionProvider: dto.typedDecisionProvider }),
      ...this.toFeaturePatch(dto, current),
    };
    if (Object.keys(patchData).length === 0) {
      setRuntimeMarginMultiplier(current.marginMultiplierGeneration);
      setRuntimeAgentChatMarginMultiplier(current.marginMultiplierAgentChat);
      return current;
    }

    const updated = await this.patch(current.id, patchData);
    // Any read that started before the write finished may hold the old row.
    this.featureSettingsGeneration += 1;
    this.cacheFeatureSettings(parsePlatformFeatureSettings(updated));
    setRuntimeMarginMultiplier(updated.marginMultiplierGeneration);
    setRuntimeAgentChatMarginMultiplier(updated.marginMultiplierAgentChat);
    return updated;
  }

  private toFeaturePatch(
    dto: UpdatePlatformSettingDto,
    current: PlatformSettingDocument,
  ): Prisma.PlatformSettingUpdateInput {
    const patch: Prisma.PlatformSettingUpdateInput = {};
    for (const key of PATCHABLE_FEATURE_KEYS) {
      // `@IsOptional` lets `null` through; these columns are NOT NULL.
      if (dto[key] !== undefined && dto[key] !== null) {
        Object.assign(patch, { [key]: dto[key] });
      }
    }
    if (dto.mediaPerceptionVisionModel !== undefined) {
      patch.mediaPerceptionVisionModel =
        dto.mediaPerceptionVisionModel?.trim() || null;
    }
    if (dto.moderationThresholds) {
      patch.moderationThresholds = dto.moderationThresholds;
    }
    if (dto.flags) {
      // A partial patch: flags the operator did not touch keep their value.
      patch.flags = { ...parsePlatformFlags(current.flags), ...dto.flags };
    }
    if (dto.systemEventsEnabledAt !== undefined) {
      patch.systemEventsEnabledAt =
        dto.systemEventsEnabledAt === null
          ? null
          : new Date(dto.systemEventsEnabledAt);
    }
    return patch;
  }

  /**
   * Refuse a moderation classifier this deployment has no credential for,
   * for the same reason as the typed-decision provider below.
   */
  private assertModerationProviderAvailable(
    dto: UpdatePlatformSettingDto,
  ): void {
    if (
      dto.moderationProvider !== 'openai' ||
      String(this.configService.get('OPENAI_API_KEY') ?? '').trim()
    ) {
      return;
    }

    throw new BadRequestException(
      'OpenAI moderation needs OPENAI_API_KEY to be configured on the server',
    );
  }

  /**
   * Refuse a provider this deployment has no credential for.
   *
   * Storing it would leave the operator looking at a setting that says Jev
   * while every decision quietly took the deterministic path — the failure
   * mode an admin switch exists to prevent.
   */
  private assertTypedDecisionProviderAvailable(
    dto: UpdatePlatformSettingDto,
  ): void {
    const provider = dto.typedDecisionProvider;
    if (
      provider === undefined ||
      isTypedDecisionProviderAvailable(provider, this.configService)
    ) {
      return;
    }

    throw new BadRequestException(
      `${TYPED_DECISION_PROVIDER_LABELS[provider]} needs TYPESAFE_API_KEY to be configured on the server`,
    );
  }
}
