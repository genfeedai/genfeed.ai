import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';
import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import type { OrganizationSettingDocument } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import type { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSION_ORDER,
  ONBOARDING_JOURNEY_MISSIONS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ModuleRef } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';

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
  ) {
    super(prisma, 'organizationSetting', logger);
  }

  private getModelsService(): ModelsService {
    if (!this.modelsService) {
      this.modelsService = this.moduleRef.get(ModelsService, { strict: false });
    }
    return this.modelsService;
  }

  /**
   * Org-bootstrap chokepoint: all organization-creation paths (legacy auth provider webhook,
   * OrganizationsController, UserSetupService) funnel through settings creation.
   * After creating settings we idempotently seed predetermined workflows.
   * Daily Trends Digest and tenant-product automation workflows are ON by default
   * and skip per org until credentials/config make them eligible.
   * Failures never block settings creation.
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
    const settings = await super.create(createDto, populate ?? []);
    await this.provisionDefaultWorkflows(settings);
    return settings;
  }

  private async provisionDefaultWorkflows(
    settings: OrganizationSettingDocument,
  ): Promise<void> {
    try {
      const settingsRecord = settings as unknown as {
        organization?: unknown;
        organizationId?: unknown;
      };
      const organizationId = String(
        settingsRecord.organizationId ?? settingsRecord.organization ?? '',
      );
      if (!organizationId) {
        return;
      }

      const organization = await this.prisma.organization.findFirst({
        select: { userId: true },
        where: { id: organizationId, isDeleted: false },
      });
      if (!organization?.userId) {
        return;
      }

      // Load the class for the ModuleRef token via a relative dynamic import.
      // A top-level value import of the workflows collection here completes a
      // module cycle (workflows → … → organization-settings) that TDZ-crashes
      // the API on boot: "Cannot access 'OrganizationSettingsService' before
      // initialization". Deferring the load to call time breaks the cycle.
      const { WorkflowTemplateSeederService } = await import(
        '../../workflows/services/workflow-template-seeder.service'
      );
      const workflowSeeder: WorkflowTemplateSeederService = this.moduleRef.get(
        WorkflowTemplateSeederService,
        { strict: false },
      );
      await workflowSeeder.ensureDailyTrendsDigestWorkflow(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureAdAutomationWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureCampaignOrchestrationWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureAgentAutopilotWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureAnalyticsSyncWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureContentProductionWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureReplyPollingWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureTrendNotificationWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureLivestreamBotWorkflows(
        organization.userId,
        organizationId,
      );
      await workflowSeeder.ensureSystemActionWorkflows(
        organization.userId,
        organizationId,
      );

      // Seeded schedules fire via BullMQ job schedulers; register them now so
      // they don't wait for the next service restart.
      await workflowSeeder.syncOrganizationWorkflowSchedulers(organizationId);
    } catch (error) {
      // Swallowed so a non-critical provisioning step never fails org creation,
      // but reported to Sentry as well as the log: otherwise new-org workflow
      // seeding can fail silently for every org (e.g. a future DI/module-graph
      // regression) with nothing but a log line nobody is watching.
      this.logger?.error(
        'Failed to provision default organization workflows',
        error,
      );
      Sentry.captureException(error);
    }
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

  /**
   * Get the latest major versions of all active models
   * Filters out older major versions (e.g., veo-2 when veo-3 exists)
   * Returns array of model ObjectIds
   */
  async getLatestMajorVersionModelIds(): Promise<string[]> {
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
   * Atomically add a model to an org's enabledModels set (idempotent via $addToSet)
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
      isDeleted: false,
      organization: organizationId,
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
