import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';
import type { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import {
  OrganizationSetting,
  type OrganizationSettingDocument,
} from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSION_ORDER,
  ONBOARDING_JOURNEY_MISSIONS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
import type { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class OrganizationSettingsService extends BaseService<
  OrganizationSettingDocument,
  CreateOrganizationSettingDto,
  UpdateOrganizationSettingDto
> {
  private modelsService!: ModelsService;

  constructor(
    @InjectModel(OrganizationSetting.name, DB_CONNECTIONS.AUTH)
    model: AggregatePaginateModel<OrganizationSettingDocument>,
    logger: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {
    super(model, logger);
  }

  private getModelsService(): ModelsService {
    if (!this.modelsService) {
      this.modelsService = this.moduleRef.get(ModelsService, { strict: false });
    }
    return this.modelsService;
  }

  /**
   * Atomically update the brands limit to a specific value
   */
  async updateBrandsLimit(
    id: string,
    newLimit: number,
  ): Promise<OrganizationSettingDocument | null> {
    return await this.model
      .findByIdAndUpdate(
        id,
        { brandsLimit: newLimit },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Atomically update the seats limit to a specific value
   */
  async updateSeatsLimit(
    id: string,
    newLimit: number,
  ): Promise<OrganizationSettingDocument | null> {
    return await this.model
      .findByIdAndUpdate(
        id,
        { seatsLimit: newLimit },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Get the latest major versions of all active models
   * Filters out older major versions (e.g., veo-2 when veo-3 exists)
   * Returns array of model ObjectIds
   */
  async getLatestMajorVersionModelIds(): Promise<Types.ObjectId[]> {
    // Fetch all active models — scope to system models only (organization: null)
    const activeModels = await this.getModelsService().findAllActive({
      organization: null,
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
      const parsed = this.parseModelKey(model.key);
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
    const filteredModelIds: Types.ObjectId[] = [];

    grouped.forEach((group) => {
      // Find the highest major version
      const maxMajor = Math.max(...group.map((item) => item.major));

      // Keep all models from the highest major version (including all minor versions)
      group.forEach((item) => {
        if (item.major === maxMajor) {
          filteredModelIds.push(new Types.ObjectId(item.model._id));
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
   * Atomically add a model to an org's enabledModels set (idempotent via $addToSet)
   */
  async addEnabledModel(
    organizationId: Types.ObjectId,
    modelId: Types.ObjectId,
  ): Promise<void> {
    await this.model.updateOne(
      { organization: organizationId },
      { $addToSet: { enabledModels: modelId } },
    );
  }

  async ensureJourneyState(
    organizationId: string,
  ): Promise<IOnboardingJourneyMissionState[]> {
    const settings = await this.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!settings) {
      return [];
    }

    const nextState = this.normalizeJourneyState(
      settings.onboardingJourneyMissions as
        | IOnboardingJourneyMissionState[]
        | undefined,
    );

    const shouldPersist =
      (settings.onboardingJourneyMissions?.length ?? 0) !== nextState.length ||
      nextState.some((mission, index) => {
        const current = settings.onboardingJourneyMissions?.[index] as
          | IOnboardingJourneyMissionState
          | undefined;
        return (
          !current ||
          current.id !== mission.id ||
          current.rewardCredits !== mission.rewardCredits
        );
      });

    if (shouldPersist) {
      await this.patch(String(settings._id), {
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
