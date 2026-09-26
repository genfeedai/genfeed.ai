import { CreatePlatformSettingDto } from '@api/collections/platform-settings/dto/create-platform-setting.dto';
import { UpdatePlatformSettingDto } from '@api/collections/platform-settings/dto/update-platform-setting.dto';
import type { PlatformSettingDocument } from '@api/collections/platform-settings/schemas/platform-setting.schema';
import { isTypedDecisionProviderAvailable } from '@api/services/typed-decisions/typed-decision-provider.factory';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  PLATFORM_SETTING_KEY,
  TYPED_DECISION_PROVIDER_LABELS,
} from '@genfeedai/contracts/constants';
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

@Injectable()
export class PlatformSettingsService
  extends BaseService<
    PlatformSettingDocument,
    CreatePlatformSettingDto,
    UpdatePlatformSettingDto
  >
  implements OnModuleInit
{
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
   * Apply an operator update to the singleton row and re-hydrate both
   * process-scoped pricing runtimes so the new margins take effect
   * immediately in this process. Only whitelisted fields are patched — the
   * singleton `key` and `id` can never be mutated through this path.
   */
  async updateSingleton(
    dto: UpdatePlatformSettingDto,
  ): Promise<PlatformSettingDocument> {
    this.assertTypedDecisionProviderAvailable(dto);

    const current = await this.getSingleton();
    const patchData = {
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
    };
    if (Object.keys(patchData).length === 0) {
      setRuntimeMarginMultiplier(current.marginMultiplierGeneration);
      setRuntimeAgentChatMarginMultiplier(current.marginMultiplierAgentChat);
      return current;
    }

    const updated = await this.patch(current.id, patchData);
    setRuntimeMarginMultiplier(updated.marginMultiplierGeneration);
    setRuntimeAgentChatMarginMultiplier(updated.marginMultiplierAgentChat);
    return updated;
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
