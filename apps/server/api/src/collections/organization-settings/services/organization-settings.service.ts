import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';
import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import type { OrganizationSettingDocument } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { isCloudDeployment } from '@genfeedai/config';
import {
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
  shouldUseLowestCostModelDefaults,
} from '@genfeedai/constants';
import type { IWebhookDeliveryStatus } from '@genfeedai/interfaces';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSION_ORDER,
  ONBOARDING_JOURNEY_MISSIONS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class OrganizationSettingsService extends BaseService<
  OrganizationSettingDocument,
  CreateOrganizationSettingDto,
  UpdateOrganizationSettingDto
> {
  private modelsService!: ModelsService;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
    private readonly configService: ConfigService,
  ) {
    super(prisma, 'organizationSetting', logger);
  }

  private getModelsService(): ModelsService {
    const modelsService =
      this.modelsService ??
      this.moduleRef.get(ModelsService, { strict: false });

    if (!modelsService) {
      throw new Error('ModelsService not available');
    }

    this.modelsService = modelsService;
    return modelsService;
  }

  /**
   * Org-bootstrap chokepoint: all organization-creation paths funnel through
   * settings creation. System workflows are **not** cloned here (#2176) —
   * tenants discover them via `GET /workflows?source=system-catalog` and
   * install via `POST /workflows` with `sourceType: "system-catalog"`.
   */
  async create(
    createDto: CreateOrganizationSettingDto,
    populate?: Parameters<
      BaseService<
        OrganizationSettingDocument,
        CreateOrganizationSettingDto,
        UpdateOrganizationSettingDto
      >['create']
    >[1],
  ): Promise<OrganizationSettingDocument> {
    return super.create(createDto, populate ?? []);
  }

  /**
   * Seed the allowlist for organizations created before the Prisma allowlist
   * migration, which have an empty enabledModelIds array.
   *
   * Seeding only — never a merge. This runs on every settings read, so folding
   * in "missing" models would re-enable everything an org deliberately turned
   * off before the next request could observe the change, making the model
   * toggles impossible to switch off. A non-empty allowlist is an explicit
   * choice and is returned untouched; deliberate additions go through
   * `addEnabledModel` or a settings PATCH.
   */
  async ensureEnabledModelIds(
    setting: OrganizationSettingDocument,
  ): Promise<OrganizationSettingDocument> {
    const currentEnabledModelIds = Array.isArray(setting.enabledModelIds)
      ? setting.enabledModelIds
      : [];

    if (currentEnabledModelIds.length > 0) {
      return setting;
    }

    const enabledModelIds = shouldUseLowestCostModelDefaults({
      isCloud: isCloudDeployment(),
      nodeEnv: this.configService.get('NODE_ENV'),
    })
      ? await this.getLowestCostModelIds()
      : await this.getLatestMajorVersionModelIds();
    if (enabledModelIds.length === 0) {
      return setting;
    }

    return this.patch(setting.id, {
      enabledModelIds,
    });
  }

  private readJourneyState(
    missions: unknown,
  ): IOnboardingJourneyMissionState[] | undefined {
    return Array.isArray(missions)
      ? (missions as unknown as IOnboardingJourneyMissionState[])
      : undefined;
  }

  /**
   * Atomically update the brands limit to a specific value
   */
  async updateBrandsLimit(
    id: string,
    newLimit: number,
  ): Promise<OrganizationSettingDocument | null> {
    return (await this.prisma.organizationSetting.update({
      data: { brandsLimit: newLimit },
      where: { id },
    })) as never;
  }

  /**
   * Atomically update the seats limit to a specific value
   */
  async updateSeatsLimit(
    id: string,
    newLimit: number,
  ): Promise<OrganizationSettingDocument | null> {
    return (await this.prisma.organizationSetting.update({
      data: { seatsLimit: newLimit },
      where: { id },
    })) as never;
  }

  async recordWebhookDeliveryStatus(
    organizationId: string,
    status: IWebhookDeliveryStatus,
  ): Promise<void> {
    const setting = await this.prisma.organizationSetting.findFirst({
      select: { id: true },
      where: { organizationId },
    });

    if (!setting) {
      return;
    }

    await this.prisma.organizationSetting.update({
      data: { webhookDeliveryStatus: status } as never,
      where: { id: setting.id },
    });
  }

  async getLowestCostModelIds(): Promise<string[]> {
    const lowestCostKeys = new Set([
      LOWEST_COST_AGENT_CHAT_MODEL_KEY,
      LOWEST_COST_IMAGE_MODEL_KEY,
      LOWEST_COST_VIDEO_MODEL_KEY,
    ]);
    const activeModels = await this.getModelsService().findAllActive({
      organizationId: null,
    });

    return (activeModels ?? [])
      .filter((model) => lowestCostKeys.has(model.key ?? ''))
      .map((model) => model.id);
  }

  /**
   * Get the latest major versions of all active models
   * Filters out older major versions (e.g., veo-2 when veo-3 exists)
   * Returns model IDs.
   */
  async getLatestMajorVersionModelIds(): Promise<string[]> {
    // Fetch all active models — scope to system models only.
    const activeModels = await this.getModelsService().findAllActive({
      organizationId: null,
    });

    if (!activeModels || activeModels.length === 0) {
      return [];
    }

    // Parse model keys to extract base name and version
    interface ParsedModel {
      model: ModelDocument;
      base: string;
      major: number;
      minor: number;
    }

    const parsedModels: ParsedModel[] = activeModels.map((model) => {
      const parsed = this.parseModelKey(model.key ?? '');
      return {
        base: parsed.base,
        major: parsed.major,
        minor: parsed.minor,
        model,
      };
    });

    // Group by base name
    const grouped = new Map<string, ParsedModel[]>();
    parsedModels.forEach((parsed) => {
      if (!grouped.has(parsed.base)) {
        grouped.set(parsed.base, []);
      }
      grouped.get(parsed.base)?.push(parsed);
    });

    // For each group, find highest major version and keep all models from that version
    const filteredModelIds: string[] = [];

    grouped.forEach((group) => {
      // Find the highest major version
      const maxMajor = Math.max(...group.map((item) => item.major));

      // Keep all models from the highest major version (including all minor versions)
      group.forEach((item) => {
        if (item.major === maxMajor) {
          filteredModelIds.push(String(item.model.id));
        }
      });
    });

    return filteredModelIds;
  }

  /**
   * Parse model key to extract base name and version
   * Examples:
   *   "google/veo-3" -> { base: "google/veo", major: 3, minor: 0 }
   *   "google/veo-3.1" -> { base: "google/veo", major: 3, minor: 1 }
   *   "google/imagen-4-fast" -> { base: "google/imagen", major: 4, minor: 0 }
   */
  private parseModelKey(key: string): {
    base: string;
    major: number;
    minor: number;
  } {
    // Match version number after a hyphen (e.g., "-3", "-3.1", "-4-fast")
    const versionMatch = key.match(/-(\d+)(?:\.(\d+))?(?:-|$)/);

    if (!versionMatch) {
      // No version found
      return {
        base: key,
        major: 0,
        minor: 0,
      };
    }

    const major = parseInt(versionMatch[1], 10);
    const minor = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0;

    // Extract base name (everything before the version number)
    const versionStartIndex = versionMatch.index ?? 0;
    const base = key.substring(0, versionStartIndex);

    return {
      base,
      major,
      minor,
    };
  }

  /**
   * Atomically add a model to an organization's enabled model IDs.
   */
  async addEnabledModel(
    organizationId: string,
    modelId: string,
  ): Promise<void> {
    const setting = await this.prisma.organizationSetting.findFirst({
      where: { organizationId },
    });
    if (!setting) return;
    const existing = setting.enabledModelIds;
    if (!existing.includes(modelId)) {
      await this.prisma.organizationSetting.update({
        data: { enabledModelIds: { push: modelId } },
        where: { id: setting.id },
      });
    }
  }

  async ensureJourneyState(
    organizationId: string,
  ): Promise<IOnboardingJourneyMissionState[]> {
    const settings = await this.findOne({
      organizationId: organizationId,
    });

    if (!settings) {
      return [];
    }

    const storedMissions = this.readJourneyState(
      settings.onboardingJourneyMissions,
    );
    const nextState = this.normalizeJourneyState(storedMissions);

    const shouldPersist =
      (storedMissions?.length ?? 0) !== nextState.length ||
      nextState.some((mission, index) => {
        const current = storedMissions?.[index];
        return (
          !current ||
          current.id !== mission.id ||
          current.rewardCredits !== mission.rewardCredits
        );
      });

    if (shouldPersist) {
      await this.patch(String(settings.id), {
        onboardingJourneyMissions: nextState,
      });
    }

    return nextState;
  }

  normalizeJourneyState(
    missions?: IOnboardingJourneyMissionState[],
  ): IOnboardingJourneyMissionState[] {
    const missionMap = new Map(
      (missions ?? []).map((mission) => [mission.id, mission]),
    );

    return ONBOARDING_JOURNEY_MISSIONS.map((mission) => {
      const current = missionMap.get(mission.id);
      return {
        completedAt: current?.completedAt ?? null,
        id: mission.id,
        isCompleted: current?.isCompleted ?? false,
        rewardClaimed: current?.rewardClaimed ?? false,
        rewardCredits: mission.rewardCredits,
      };
    });
  }

  getNextRecommendedJourneyMission(
    missions?: IOnboardingJourneyMissionState[],
  ): OnboardingJourneyMissionId | null {
    const normalized = this.normalizeJourneyState(missions);
    return (
      ONBOARDING_JOURNEY_MISSION_ORDER.find((missionId) => {
        const mission = normalized.find((item) => item.id === missionId);
        return !mission?.isCompleted;
      }) ?? null
    );
  }
}
