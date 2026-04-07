import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreatorScraperService } from '@api/collections/content-intelligence/services/creator-scraper.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { GenerateImageDto } from '@api/endpoints/admin/darkroom/dto/generate-image.dto';
import { DarkroomGenerationJob } from '@api/endpoints/admin/darkroom/interfaces/darkroom-generation-job.interface';
import { DarkroomTrainingService } from '@api/endpoints/admin/darkroom/services/darkroom-training.service';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';
import { MODEL_KEYS } from '@genfeedai/constants';
import type { DarkroomReviewStatus } from '@genfeedai/enums';
import {
  ContentIntelligencePlatform,
  type ContentRating,
  CredentialPlatform,
  type DarkroomAssetLabel,
  DarkroomReviewStatus as DarkroomReviewStatusEnum,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  LoraStatus,
  TrainingCategory,
  TrainingProvider,
  TrainingStage,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import axios from 'axios';
import type { Types } from 'mongoose';

interface EC2InstanceStatus {
  instanceId: string;
  name: string;
  role: string;
  state: string;
  instanceType: string;
}

interface DarkroomIngestFailure {
  error: string;
  filename: string;
}

interface DarkroomIngestResult {
  failed: DarkroomIngestFailure[];
  failedCount: number;
  uploadedCount: number;
}

@Injectable()
export class DarkroomService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly ec2Client: EC2Client;
  private readonly cloudFrontClient: CloudFrontClient;

  constructor(
    private readonly brandsService: BrandsService,
    private readonly personasService: PersonasService,
    private readonly ingredientsService: IngredientsService,
    private readonly trainingsService: TrainingsService,
    private readonly darkroomTrainingService: DarkroomTrainingService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly comfyuiService: ComfyUIService,
    private readonly instagramService: InstagramService,
    private readonly twitterService: TwitterService,
    private readonly facebookService: FacebookService,
    private readonly credentialsService: CredentialsService,
    private readonly filesClientService: FilesClientService,
    private readonly creatorScraperService: CreatorScraperService,
    private readonly fleetService: FleetService,
    private readonly heyGenService: HeyGenService,
    private readonly elevenLabsService: ElevenLabsService,
  ) {
    const region = this.configService.get('AWS_REGION') || 'us-east-1';
    const credentials = {
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID') || '',
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY') || '',
    };

    this.ec2Client = new EC2Client({ credentials, region });
    this.cloudFrontClient = new CloudFrontClient({ credentials, region });
  }

  /**
   * Get all darkroom characters (personas with isDarkroomCharacter: true)
   */
  getCharacters(organizationId: string): Promise<PersonaDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId });

    return this.personasService.findAllByOrganization(organizationId, {
      isDarkroomCharacter: true,
    });
  }

  /**
   * Get a single darkroom character by slug
   */
  async getCharacterBySlug(
    slug: string,
    organizationId: string,
  ): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId, slug });

    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug,
    });

    if (!persona) {
      throw new NotFoundException(`Character with slug "${slug}" not found`);
    }

    return persona;
  }

  /**
   * Create a new darkroom character
   */
  createCharacter(
    data: Partial<PersonaDocument> & {
      user: Types.ObjectId;
      organization: Types.ObjectId;
      brand: Types.ObjectId;
    },
  ): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { slug: data.slug });

    return this.personasService.create({
      ...data,
      isDarkroomCharacter: true,
    } as Parameters<PersonasService['create']>[0]);
  }

  /**
   * Update a darkroom character
   */
  updateCharacter(
    id: string,
    data: Partial<PersonaDocument>,
  ): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { id });

    return this.personasService.patch(
      id,
      data as Parameters<PersonasService['patch']>[1],
    );
  }

  /**
   * Get assets (ingredients) for a persona
   */
  getAssets(
    organizationId: string,
    filters: {
      personaSlug?: string;
      reviewStatus?: DarkroomReviewStatus;
      assetLabel?: DarkroomAssetLabel;
      contentRating?: ContentRating;
      campaign?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<IngredientDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { filters, organizationId });

    const query: Record<string, unknown> = {
      persona: { $exists: true },
    };

    if (filters.personaSlug) {
      query.personaSlug = filters.personaSlug;
    }
    if (filters.reviewStatus) {
      query.reviewStatus = filters.reviewStatus;
    }
    if (filters.assetLabel) {
      query.assetLabel = filters.assetLabel;
    }
    if (filters.contentRating) {
      query.contentRating = filters.contentRating;
    }
    if (filters.campaign) {
      query.campaign = filters.campaign;
    }

    return this.ingredientsService.findAllByOrganization(organizationId, query);
  }

  private getDefaultDarkroomModerationState(): Pick<
    Parameters<IngredientsService['create']>[0],
    'contentRating' | 'reviewStatus'
  > {
    return {
      contentRating: undefined,
      reviewStatus: DarkroomReviewStatusEnum.PENDING,
    };
  }

  /**
   * Review an asset (approve/reject)
   */
  async reviewAsset(
    ingredientId: string,
    organizationId: string,
    reviewStatus: DarkroomReviewStatus,
  ): Promise<IngredientDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      ingredientId,
      organizationId,
      reviewStatus,
    });

    // Verify ingredient belongs to organization before updating (multi-tenant guard)
    const ingredient = await this.ingredientsService.findOne({
      _id: ingredientId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!ingredient) {
      throw new NotFoundException(
        `Asset "${ingredientId}" not found in organization "${organizationId}"`,
      );
    }

    const updated = await this.ingredientsService.patch(ingredientId, {
      reviewStatus,
    } as Parameters<IngredientsService['patch']>[1]);

    if (
      reviewStatus === DarkroomReviewStatusEnum.APPROVED &&
      ingredient.reviewStatus !== DarkroomReviewStatusEnum.APPROVED &&
      ingredient.personaSlug &&
      ingredient.cdnUrl &&
      ingredient.category === IngredientCategory.IMAGE
    ) {
      await this.syncApprovedAssetToDataset(
        organizationId,
        ingredient.personaSlug,
        ingredient,
      );
    }

    return updated;
  }

  /**
   * Get trainings for a persona
   */
  getTrainings(
    organizationId: string,
    personaSlug?: string,
  ): Promise<TrainingDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId, personaSlug });

    const filters: Record<string, unknown> = {};
    if (personaSlug) {
      filters.personaSlug = personaSlug;
    }

    return this.trainingsService.findAllByOrganization(organizationId, filters);
  }

  /**
   * Get a single training by ID
   */
  async getTraining(
    trainingId: string,
    organizationId: string,
  ): Promise<TrainingDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId, trainingId });

    const training = await this.trainingsService.findOne({
      _id: trainingId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!training) {
      throw new NotFoundException(`Training "${trainingId}" not found`);
    }

    return training;
  }

  /**
   * Start a new darkroom training job.
   * Creates a training record and fires off the pipeline asynchronously.
   */
  @SentryTraced()
  async startTraining(
    organizationId: string,
    userId: string,
    _brandId: string,
    data: {
      personaSlug: string;
      label: string;
      sourceIds: string[];
      steps?: number;
      learningRate?: number;
      loraRank?: number;
      loraName?: string;
      baseModel?: string;
    },
  ): Promise<TrainingDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      personaSlug: data.personaSlug,
    });

    // Resolve persona
    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug: data.personaSlug,
    });

    if (!persona) {
      throw new NotFoundException(`Character "${data.personaSlug}" not found`);
    }

    const dataset = await this.darkroomTrainingService.getDatasetInfo(
      data.personaSlug,
    );
    if (dataset.imageCount === 0) {
      throw new BadRequestException(
        `Dataset for "${data.personaSlug}" is empty. Upload training images before starting LoRA training.`,
      );
    }

    // Auto-tune hyperparameters based on dataset size
    // @ts-expect-error TS2352
    const imageCount =
      (persona as Record<string, unknown>).selectedImagesCount ?? 20;
    const autoTuned =
      // @ts-expect-error TS2345
      this.darkroomTrainingService.autoTuneHyperparameters(imageCount);

    const steps = data.steps ?? autoTuned.steps;
    const loraRank = data.loraRank ?? autoTuned.rank;
    const learningRate = data.learningRate ?? autoTuned.learningRate;
    const baseModel = data.baseModel ?? MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO;
    const triggerWord = persona.triggerWord ?? data.personaSlug;
    const loraName = data.loraName ?? `${triggerWord}_zimage`;

    // Create training record
    const sourceIds =
      data.sourceIds.length > 0
        ? data.sourceIds
        : (
            await this.ingredientsService.findAllByOrganization(
              organizationId,
              {
                isDeleted: false,
                persona: persona._id,
                reviewStatus: DarkroomReviewStatusEnum.APPROVED,
              },
            )
          ).map((ingredient) => ingredient._id.toString());

    const training = await this.trainingsService.create({
      baseModel,
      category: TrainingCategory.SUBJECT,
      label: data.label,
      learningRate,
      loraName,
      loraRank,
      model: baseModel,
      organization: ObjectIdUtil.toObjectId(organizationId)!,
      persona: persona._id,
      personaSlug: data.personaSlug,
      progress: 0,
      provider: TrainingProvider.GENFEED_AI,
      sources: sourceIds.map((id) => ObjectIdUtil.toObjectId(id)!),
      stage: TrainingStage.QUEUED,
      steps,
      trigger: triggerWord,
      user: ObjectIdUtil.toObjectId(userId)!,
    } as Parameters<TrainingsService['create']>[0]);

    await this.personasService.patch(persona._id.toString(), {
      loraModelPath: undefined,
      loraStatus: LoraStatus.TRAINING,
    });

    // Fire-and-forget: execute training pipeline asynchronously
    this.darkroomTrainingService
      .executeTrainingPipeline({
        baseModel,
        learningRate,
        loraName,
        loraRank,
        organizationId,
        personaSlug: data.personaSlug,
        steps,
        trainingId: training._id.toString(),
        triggerWord,
      })
      .catch((error) => {
        this.loggerService.error(caller, {
          error: error instanceof Error ? error.message : String(error),
          message: 'Training pipeline failed',
          trainingId: training._id.toString(),
        });
      });

    return training;
  }

  // === Infrastructure ===

  /**
   * Get EC2 instance statuses filtered by the 'Project: darkroom' tag.
   */
  async getEC2Status(): Promise<EC2InstanceStatus[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    try {
      const command = new DescribeInstancesCommand({
        Filters: [
          { Name: 'tag:Project', Values: ['darkroom', 'fleet'] },
          {
            Name: 'instance-state-name',
            Values: ['pending', 'running', 'stopping', 'stopped'],
          },
        ],
      });

      const response = await this.ec2Client.send(command);
      const instances: EC2InstanceStatus[] = [];

      for (const reservation of response.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          const nameTag = instance.Tags?.find((tag) => tag.Key === 'Name');
          const roleTag = instance.Tags?.find((tag) => tag.Key === 'Role');
          instances.push({
            instanceId: instance.InstanceId ?? 'unknown',
            instanceType: instance.InstanceType ?? 'unknown',
            name: nameTag?.Value ?? 'unnamed',
            role: roleTag?.Value ?? 'training',
            state: instance.State?.Name ?? 'unknown',
          });
        }
      }

      return instances;
    } catch (error: unknown) {
      this.loggerService.error(caller, {
        error: getErrorMessage(error),
        message: 'Failed to describe EC2 instances',
      });
      throw error;
    }
  }

  /**
   * Start or stop an EC2 instance.
   */
  async ec2Action(
    instanceId: string,
    action: 'start' | 'stop',
  ): Promise<{ message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { action, instanceId });

    try {
      const stateChanges =
        action === 'start'
          ? (
              await this.ec2Client.send(
                new StartInstancesCommand({ InstanceIds: [instanceId] }),
              )
            ).StartingInstances
          : (
              await this.ec2Client.send(
                new StopInstancesCommand({ InstanceIds: [instanceId] }),
              )
            ).StoppingInstances;

      const currentState = stateChanges?.[0]?.CurrentState?.Name ?? 'unknown';
      const previousState = stateChanges?.[0]?.PreviousState?.Name ?? 'unknown';

      this.loggerService.log(caller, {
        currentState,
        instanceId,
        message: `EC2 instance ${action} successful`,
        previousState,
      });

      return {
        message: `Instance ${instanceId} ${action} executed (${previousState} -> ${currentState})`,
      };
    } catch (error: unknown) {
      this.loggerService.error(caller, {
        action,
        error: getErrorMessage(error),
        instanceId,
        message: `Failed to ${action} EC2 instance`,
      });
      throw error;
    }
  }

  async ec2ActionAll(
    action: 'start' | 'stop',
    role?: string,
  ): Promise<{
    action: 'start' | 'stop';
    results: Array<{
      instanceId: string;
      name: string;
      state: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    const instances = await this.getEC2Status();
    const matchingInstances = instances.filter((instance) => {
      const matchesRole = role ? instance.role === role : true;
      const matchesState =
        action === 'start'
          ? instance.state === 'stopped'
          : instance.state === 'running';
      return matchesRole && matchesState;
    });

    const results = await Promise.all(
      matchingInstances.map(async (instance) => {
        try {
          await this.ec2Action(instance.instanceId, action);
          return {
            instanceId: instance.instanceId,
            name: instance.name,
            state: instance.state,
            success: true,
          };
        } catch (error: unknown) {
          return {
            error: getErrorMessage(error),
            instanceId: instance.instanceId,
            name: instance.name,
            state: instance.state,
            success: false,
          };
        }
      }),
    );

    return { action, results };
  }

  /**
   * Invalidate CloudFront cache for the given distribution and paths.
   */
  async invalidateCloudFront(
    distributionId: string,
    paths?: string[],
  ): Promise<{ message: string; invalidationId: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const invalidationPaths = paths?.length ? paths : ['/*'];
    if (!distributionId) {
      throw new BadRequestException(
        'CloudFront distribution ID is not configured for darkroom invalidation',
      );
    }
    this.loggerService.log(caller, {
      distributionId,
      paths: invalidationPaths,
    });

    try {
      const command = new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `darkroom-${Date.now()}`,
          Paths: {
            Items: invalidationPaths,
            Quantity: invalidationPaths.length,
          },
        },
      });

      const response = await this.cloudFrontClient.send(command);
      const invalidationId = response.Invalidation?.Id ?? 'unknown';

      this.loggerService.log(caller, {
        distributionId,
        invalidationId,
        message: 'CloudFront invalidation created',
        paths: invalidationPaths,
      });

      return {
        invalidationId,
        message: `CloudFront invalidation created for ${distributionId} (${invalidationPaths.join(', ')})`,
      };
    } catch (error: unknown) {
      this.loggerService.error(caller, {
        distributionId,
        error: getErrorMessage(error),
        message: 'Failed to create CloudFront invalidation',
        paths: invalidationPaths,
      });
      throw error;
    }
  }

  getDefaultCloudFrontDistributionId(): string {
    return this.configService.get('DARKROOM_CLOUDFRONT_DISTRIBUTION_ID') || '';
  }

  /**
   * Check health of ComfyUI and Ollama services.
   */
  async getServiceHealth(): Promise<
    { name: string; status: 'online' | 'offline' | 'unknown'; url: string }[]
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    const services = [
      {
        name: 'images.genfeed.ai',
        url: this.configService.get('GPU_IMAGES_URL') || '',
      },
      {
        name: 'voices.genfeed.ai',
        url: this.configService.get('GPU_VOICES_URL') || '',
      },
      {
        name: 'videos.genfeed.ai',
        url: this.configService.get('GPU_VIDEOS_URL') || '',
      },
      {
        name: 'llm.genfeed.ai',
        url: this.configService.get('GPU_LLM_URL') || '',
      },
    ].filter((s) => s.url);

    const results = await Promise.all(
      services.map(async (service) => {
        try {
          await axios.get(`${service.url}/v1/health`, { timeout: 5000 });
          return {
            name: service.name,
            status: 'online' as const,
            url: service.url,
          };
        } catch {
          return {
            name: service.name,
            status: 'offline' as const,
            url: service.url,
          };
        }
      }),
    );

    return results;
  }

  // === Asset Publishing ===

  /**
   * Publish an approved asset to social platforms.
   */
  async publishAsset(
    ingredientId: string,
    organizationId: string,
    brandId: string,
    platforms: string[],
    caption?: string,
  ): Promise<{
    success: boolean;
    results: Record<string, { success: boolean; id?: string; error?: string }>;
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      brandId,
      ingredientId,
      organizationId,
      platforms,
    });

    // Verify ingredient exists and is approved
    const ingredient = await this.ingredientsService.findOne({
      _id: ingredientId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!ingredient) {
      throw new NotFoundException(
        `Asset "${ingredientId}" not found in organization "${organizationId}"`,
      );
    }

    if (ingredient.reviewStatus !== DarkroomReviewStatusEnum.APPROVED) {
      throw new BadRequestException(
        `Asset must be approved before publishing (current status: ${ingredient.reviewStatus})`,
      );
    }

    if (!ingredient.cdnUrl) {
      throw new BadRequestException(
        'Asset must have a CDN URL to be published',
      );
    }

    const results: Record<
      string,
      { success: boolean; id?: string; error?: string }
    > = {};

    // Publish to each platform
    for (const platform of platforms) {
      try {
        let platformId: string;

        switch (platform.toLowerCase()) {
          case 'instagram': {
            const igResult = await this.instagramService.uploadImage(
              organizationId,
              brandId,
              ingredient.cdnUrl,
              caption || '',
            );
            platformId = igResult.mediaId;
            results.instagram = { id: platformId, success: true };
            break;
          }

          case 'twitter':
            platformId = await this.twitterService.uploadMedia(
              organizationId,
              brandId,
              ingredient.cdnUrl,
              caption || '',
              'image/jpeg',
            );
            results.twitter = { id: platformId, success: true };
            break;

          case 'facebook': {
            // Facebook requires pageId and pageAccessToken
            const fbCredential = await this.credentialsService.findOne({
              brand: ObjectIdUtil.toObjectId(brandId)!,
              isDeleted: false,
              organization: ObjectIdUtil.toObjectId(organizationId)!,
              platform: CredentialPlatform.FACEBOOK,
            });

            if (!fbCredential?.accessToken || !fbCredential?.externalId) {
              throw new Error('Facebook credential not found');
            }

            const decryptedToken = EncryptionUtil.decrypt(
              fbCredential.accessToken,
            );

            platformId = await this.facebookService.uploadImage(
              fbCredential.externalId,
              decryptedToken,
              ingredient.cdnUrl,
              caption || '',
            );
            results.facebook = { id: platformId, success: true };
            break;
          }

          default:
            results[platform] = {
              error: `Unsupported platform: ${platform}`,
              success: false,
            };
        }
      } catch (error: unknown) {
        this.loggerService.error(caller, {
          error: getErrorMessage(error),
          ingredientId,
          platform,
        });
        results[platform] = {
          error: getErrorMessage(error),
          success: false,
        };
      }
    }

    const allSuccessful = Object.values(results).every((r) => r.success);

    return {
      results,
      success: allSuccessful,
    };
  }

  // === Image Generation ===

  /**
   * Generate an image for a character using ComfyUI.
   */
  @SentryTraced()
  async generateImage(
    organizationId: string,
    brandId: string,
    userId: string,
    personaSlug: string,
    prompt: string,
    options: {
      model?: string;
      negativePrompt?: string;
      steps?: number;
      seed?: number;
      cfgScale?: number;
      width?: number;
      height?: number;
      lora?: string;
      loraStrength?: number;
      ingredientId?: string;
    },
  ): Promise<IngredientDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      personaSlug,
      prompt,
    });

    // Verify persona exists
    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug: personaSlug,
    });

    if (!persona) {
      throw new NotFoundException(`Character "${personaSlug}" not found`);
    }

    // Determine model and parameters
    const model = options.model || MODEL_KEYS.GENFEED_AI_FLUX2_DEV;
    const comfyParams: Record<string, unknown> = {
      prompt,
    };

    if (options.negativePrompt) {
      comfyParams.negativePrompt = options.negativePrompt;
    }
    if (options.steps) {
      comfyParams.steps = options.steps;
    }
    if (options.seed !== undefined) {
      comfyParams.seed = options.seed;
    }
    if (options.cfgScale) {
      comfyParams.cfg = options.cfgScale;
    }
    if (options.width) {
      comfyParams.width = options.width;
    }
    if (options.height) {
      comfyParams.height = options.height;
    }
    if (options.lora) {
      comfyParams.loraPath = options.lora;
    }
    if (options.loraStrength) {
      comfyParams.loraStrength = options.loraStrength;
    }

    // Generate image via ComfyUI
    const { imageBuffer, filename } = await this.comfyuiService.generateImage(
      model,
      comfyParams,
    );

    if (options.ingredientId) {
      await this.ingredientsService.patch(options.ingredientId, {
        generationProgress: 90,
        generationStage: 'uploading',
        status: IngredientStatus.PROCESSING,
      });
    }

    // Upload image buffer to S3 via files microservice
    const s3Meta = await this.filesClientService.uploadToS3(
      `darkroom/${personaSlug}/${filename}`,
      'images',
      {
        contentType: 'image/png',
        data: imageBuffer,
        type: FileInputType.BUFFER,
      },
    );
    const cdnUrl =
      s3Meta.publicUrl ??
      `https://cdn.genfeed.ai/darkroom/${personaSlug}/${filename}`;

    const ingredient =
      options.ingredientId === undefined
        ? await this.ingredientsService.create({
            brand: ObjectIdUtil.toObjectId(brandId)!,
            cdnUrl,
            ...this.getDefaultDarkroomModerationState(),
            generationSource: model,
            modelUsed: model,
            organization: ObjectIdUtil.toObjectId(organizationId)!,
            persona: persona._id,
            personaSlug,
            s3Key: `darkroom/${personaSlug}/${filename}`,
            status: IngredientStatus.GENERATED,
            user: ObjectIdUtil.toObjectId(userId)!,
          } as Parameters<IngredientsService['create']>[0])
        : await this.ingredientsService.patch(options.ingredientId, {
            cdnUrl,
            generationCompletedAt: new Date(),
            generationError: undefined,
            generationProgress: 100,
            generationSource: model,
            generationStage: 'completed',
            modelUsed: model,
            reviewStatus: DarkroomReviewStatusEnum.PENDING,
            s3Key: `darkroom/${personaSlug}/${filename}`,
            status: IngredientStatus.GENERATED,
          });

    this.loggerService.log(caller, {
      ingredientId: ingredient._id.toString(),
      message: 'Image generated successfully',
    });

    return ingredient;
  }

  async uploadDataset(
    organizationId: string,
    slug: string,
    files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>,
    captions?: Array<{ filenameStem: string; caption: string }>,
  ): Promise<DarkroomIngestResult> {
    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug,
    });

    if (!persona) {
      throw new NotFoundException(`Character "${slug}" not found`);
    }

    const captionMap = new Map(
      (captions ?? []).map((entry) => [
        entry.filenameStem.toLowerCase(),
        entry,
      ]),
    );
    const s3Keys: string[] = [];
    let uploadedCount = 0;
    let failedCount = 0;
    const failed: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      const filename = file.originalname;
      const stem = filename.replace(/\.[^.]+$/, '').toLowerCase();
      const imageKey = `darkroom/datasets/${slug}/${filename}`;

      try {
        await this.filesClientService.uploadToS3(imageKey, 'images', {
          contentType: file.mimetype,
          data: file.buffer,
          type: FileInputType.BUFFER,
        });
        s3Keys.push(imageKey);

        const caption = captionMap.get(stem);
        if (caption) {
          const captionKey = `darkroom/datasets/${slug}/${caption.filenameStem}.txt`;
          await this.filesClientService.uploadToS3(captionKey, 'images', {
            contentType: 'text/plain',
            data: Buffer.from(caption.caption, 'utf8'),
            type: FileInputType.BUFFER,
          });
          s3Keys.push(captionKey);
        }

        uploadedCount++;
      } catch (error: unknown) {
        failedCount++;
        failed.push({
          error: getErrorMessage(error),
          filename,
        });
      }
    }

    if (s3Keys.length > 0) {
      await this.darkroomTrainingService.syncDataset(slug, s3Keys);
    }

    return { failed, failedCount, uploadedCount };
  }

  async ingestTrainingDataForCharacter(
    organizationId: string,
    userId: string,
    slug: string,
  ): Promise<DarkroomIngestResult> {
    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug,
    });

    if (!persona) {
      throw new NotFoundException(`Character "${slug}" not found`);
    }

    return this.ingestTrainingDataForPersonaDocument(
      organizationId,
      userId,
      persona,
    );
  }

  async ingestTrainingDataForAllEnabledCharacters(
    organizationId: string,
    userId: string,
  ): Promise<DarkroomIngestResult> {
    const personas = await this.personasService.findAllByOrganization(
      organizationId,
      {
        isDarkroomCharacter: true,
      },
    );

    let uploadedCount = 0;
    let failedCount = 0;
    const failed: DarkroomIngestFailure[] = [];

    for (const persona of personas) {
      const brandId =
        typeof persona.brand === 'string'
          ? persona.brand
          : persona.brand?.toString();

      if (!brandId) {
        continue;
      }

      const brand = await this.brandsService.findOne(
        {
          _id: brandId,
          isDeleted: false,
          organization: organizationId,
        },
        'none',
      );

      if (!brand?.isDarkroomEnabled) {
        continue;
      }

      const result = await this.ingestTrainingDataForPersonaDocument(
        organizationId,
        userId,
        persona,
      );

      uploadedCount += result.uploadedCount;
      failedCount += result.failedCount;
      failed.push(...result.failed);
    }

    return {
      failed,
      failedCount,
      uploadedCount,
    };
  }

  async createGenerationJob(
    organizationId: string,
    brandId: string,
    userId: string,
    dto: GenerateImageDto,
  ): Promise<DarkroomGenerationJob> {
    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug: dto.personaSlug,
    });

    if (!persona) {
      throw new NotFoundException(`Character "${dto.personaSlug}" not found`);
    }

    const loraPath = dto.lora || undefined;

    const ingredient = await this.ingredientsService.create({
      brand: ObjectIdUtil.toObjectId(brandId)!,
      category: 'image',
      ...this.getDefaultDarkroomModerationState(),
      generationError: undefined,
      generationProgress: 5,
      generationPrompt: dto.prompt,
      generationSource: dto.model || MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
      generationStage: 'queued',
      generationStartedAt: new Date(),
      loraUsed: loraPath,
      modelUsed: dto.model || MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
      negativePrompt: dto.negativePrompt,
      organization: ObjectIdUtil.toObjectId(organizationId)!,
      persona: persona._id,
      personaSlug: dto.personaSlug,
      status: IngredientStatus.PROCESSING,
      user: ObjectIdUtil.toObjectId(userId)!,
    } as Parameters<IngredientsService['create']>[0]);

    void this.processGenerationJob(
      ingredient._id.toString(),
      organizationId,
      brandId,
      userId,
      {
        ...dto,
        lora: loraPath,
      },
    );

    return this.mapIngredientToGenerationJob(ingredient);
  }

  async getGenerationJob(
    jobId: string,
    organizationId: string,
  ): Promise<DarkroomGenerationJob> {
    const ingredient = await this.ingredientsService.findOne({
      _id: jobId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!ingredient) {
      throw new NotFoundException(`Generation job "${jobId}" not found`);
    }

    return this.mapIngredientToGenerationJob(ingredient);
  }

  private async updateGenerationJob(
    jobId: string,
    updates: Partial<DarkroomGenerationJob>,
  ): Promise<void> {
    await this.ingredientsService.patch(jobId, {
      cdnUrl: updates.cdnUrl,
      generationCompletedAt:
        updates.status === 'completed' || updates.status === 'failed'
          ? new Date()
          : undefined,
      generationError: updates.error,
      generationProgress: updates.progress,
      generationStage: updates.stage,
      status:
        updates.status === 'failed'
          ? IngredientStatus.FAILED
          : updates.status === 'completed'
            ? IngredientStatus.GENERATED
            : IngredientStatus.PROCESSING,
    });
  }

  private async processGenerationJob(
    jobId: string,
    organizationId: string,
    brandId: string,
    userId: string,
    dto: GenerateImageDto,
  ): Promise<void> {
    await this.updateGenerationJob(jobId, {
      progress: 15,
      stage: 'validating inputs',
      status: 'processing',
    });

    let pulseProgress = 20;
    const pulse = setInterval(() => {
      pulseProgress = Math.min(pulseProgress + 7, 82);
      void this.updateGenerationJob(jobId, {
        progress: pulseProgress,
        stage: 'running on ComfyUI',
        status: 'processing',
      });
    }, 2000);

    try {
      const ingredient = await this.generateImage(
        organizationId,
        brandId,
        userId,
        dto.personaSlug,
        dto.prompt,
        {
          cfgScale: dto.cfgScale,
          ingredientId: jobId,
          lora: dto.lora,
          model: dto.model,
          negativePrompt: dto.negativePrompt,
          seed: dto.seed,
          steps: dto.steps,
          ...this.getDimensionsFromAspectRatio(dto.aspectRatio),
        },
      );

      clearInterval(pulse);
      await this.updateGenerationJob(jobId, {
        cdnUrl: ingredient.cdnUrl,
        ingredientId: ingredient._id.toString(),
        progress: 100,
        stage: 'completed',
        status: 'completed',
      });
    } catch (error: unknown) {
      clearInterval(pulse);
      await this.updateGenerationJob(jobId, {
        error: getErrorMessage(error),
        progress: 100,
        stage: 'failed',
        status: 'failed',
      });
    }
  }

  private getDimensionsFromAspectRatio(aspectRatio?: string): {
    width?: number;
    height?: number;
  } {
    if (!aspectRatio) {
      return {};
    }

    const [w, h] = aspectRatio.split(':').map(Number);
    if (!(w && h)) {
      return {};
    }

    const scale = 1024 / Math.max(w, h);
    return {
      height: Math.round(h * scale),
      width: Math.round(w * scale),
    };
  }

  private mapIngredientToGenerationJob(
    ingredient: IngredientDocument,
  ): DarkroomGenerationJob {
    const stage = ingredient.generationStage ?? 'queued';
    const status =
      ingredient.status === IngredientStatus.FAILED
        ? 'failed'
        : ingredient.status === IngredientStatus.GENERATED
          ? 'completed'
          : stage === 'queued'
            ? 'queued'
            : stage === 'uploading'
              ? 'uploading'
              : 'processing';

    return {
      cdnUrl: ingredient.cdnUrl,
      createdAt:
        ingredient.createdAt?.toISOString() ?? new Date().toISOString(),
      error: ingredient.generationError,
      ingredientId: ingredient._id.toString(),
      jobId: ingredient._id.toString(),
      model: ingredient.modelUsed ?? ingredient.generationSource ?? '',
      personaSlug: ingredient.personaSlug ?? '',
      progress: ingredient.generationProgress ?? 0,
      prompt: ingredient.generationPrompt ?? '',
      stage,
      status,
      updatedAt:
        ingredient.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  // === Pipeline Stats & Campaigns ===

  /**
   * List campaigns with asset counts.
   */
  async listCampaigns(organizationId: string): Promise<
    {
      campaign: string;
      assetCount: number;
      approvedCount: number;
      createdAt: string;
      status: 'active' | 'completed' | 'draft';
    }[]
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId });

    const orgId = ObjectIdUtil.toObjectId(organizationId);

    // Aggregate campaigns from ingredients collection
    const campaigns = await this.ingredientsService.model.aggregate([
      {
        $match: {
          campaign: { $exists: true, $ne: null },
          isDeleted: false,
          organization: orgId,
        },
      },
      {
        $group: {
          _id: '$campaign',
          approvedCount: {
            $sum: {
              $cond: [
                { $eq: ['$reviewStatus', DarkroomReviewStatusEnum.APPROVED] },
                1,
                0,
              ],
            },
          },
          assetCount: { $sum: 1 },
          createdAt: { $min: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 0,
          approvedCount: 1,
          assetCount: 1,
          campaign: '$_id',
          createdAt: 1,
        },
      },
      {
        $sort: { campaign: 1 },
      },
    ]);

    return campaigns.map(
      (campaign: {
        approvedCount: number;
        assetCount: number;
        campaign: string;
        createdAt?: Date;
      }) => ({
        approvedCount: campaign.approvedCount,
        assetCount: campaign.assetCount,
        campaign: campaign.campaign,
        createdAt: (campaign.createdAt ?? new Date(0)).toISOString(),
        status:
          campaign.approvedCount === 0
            ? 'draft'
            : campaign.approvedCount >= campaign.assetCount
              ? 'completed'
              : 'active',
      }),
    );
  }

  /**
   * Get pipeline statistics aggregating assets and trainings.
   */
  async getPipelineStats(organizationId: string): Promise<{
    assets: {
      total: number;
      byStatus: Record<string, number>;
      byReviewStatus: Record<string, number>;
    };
    trainings: {
      total: number;
      byStage: Record<string, number>;
    };
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId });

    const orgId = ObjectIdUtil.toObjectId(organizationId);

    // Aggregate asset stats
    const assetStats = await this.ingredientsService.model.aggregate([
      {
        $match: {
          isDeleted: false,
          organization: orgId,
          persona: { $exists: true },
        },
      },
      {
        $facet: {
          byReviewStatus: [
            {
              $group: {
                _id: '$reviewStatus',
                count: { $sum: 1 },
              },
            },
          ],
          byStatus: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
              },
            },
          ],
          total: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ]);

    // Aggregate training stats
    const trainingStats = await this.trainingsService.model.aggregate([
      {
        $match: {
          isDeleted: false,
          organization: orgId,
        },
      },
      {
        $facet: {
          byStage: [
            {
              $group: {
                _id: '$stage',
                count: { $sum: 1 },
              },
            },
          ],
          total: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ]);

    // Transform aggregation results
    const assetResult = assetStats[0] || {};
    const trainingResult = trainingStats[0] || {};

    const byStatus: Record<string, number> = {};
    for (const item of assetResult.byStatus || []) {
      byStatus[item._id || 'unknown'] = item.count;
    }

    const byReviewStatus: Record<string, number> = {};
    for (const item of assetResult.byReviewStatus || []) {
      byReviewStatus[item._id || 'unknown'] = item.count;
    }

    const byStage: Record<string, number> = {};
    for (const item of trainingResult.byStage || []) {
      byStage[item._id || 'unknown'] = item.count;
    }

    return {
      assets: {
        byReviewStatus,
        byStatus,
        total: assetResult.total?.[0]?.count || 0,
      },
      trainings: {
        byStage,
        total: trainingResult.total?.[0]?.count || 0,
      },
    };
  }

  // === Lip Sync ===

  /**
   * Generate a lip-synced video using HeyGen photo avatar API.
   * If text is provided instead of audioUrl, generates TTS first.
   */
  @SentryTraced()
  async generateLipSync(
    organizationId: string,
    data: {
      personaSlug: string;
      imageUrl: string;
      audioUrl?: string;
      text?: string;
    },
  ): Promise<{ jobId: string; status: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      personaSlug: data.personaSlug,
    });

    // Verify persona exists
    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug: data.personaSlug,
    });

    if (!persona) {
      throw new NotFoundException(`Character "${data.personaSlug}" not found`);
    }

    let audioUrl = data.audioUrl;

    // If text is provided, generate TTS audio first
    if (!audioUrl && data.text) {
      const defaultVoiceId = (persona as Record<string, unknown>).voiceId as
        | string
        | undefined;

      if (!defaultVoiceId) {
        throw new BadRequestException(
          'No audio URL provided and character has no default voice. Provide an audioUrl or set a voice for this character.',
        );
      }

      const ttsResult = await this.elevenLabsService.generateAndUploadAudio(
        defaultVoiceId,
        data.text,
        `lip-sync-${Date.now()}`,
      );

      audioUrl = ttsResult.audioUrl;
    }

    if (!audioUrl) {
      throw new BadRequestException('Either audioUrl or text must be provided');
    }

    const metadataId = `lip-sync-${persona.slug}-${Date.now()}`;
    const videoId = await this.heyGenService.generatePhotoAvatarVideo(
      metadataId,
      data.imageUrl,
      audioUrl,
    );

    return {
      jobId: videoId,
      status: 'processing',
    };
  }

  /**
   * Check lip sync job status via HeyGen.
   */
  async getLipSyncStatus(
    jobId: string,
  ): Promise<{ status: string; videoUrl?: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { jobId });

    const statusClient = this.heyGenService as unknown as {
      getVideoStatus?: (
        id: string,
      ) => Promise<{ status: string; videoUrl?: string }>;
    };

    if (typeof statusClient.getVideoStatus === 'function') {
      try {
        const status = await statusClient.getVideoStatus(jobId);
        if (status?.status) {
          return status;
        }
      } catch (error: unknown) {
        this.loggerService.warn(
          `${caller} provider status polling unavailable, falling back to webhook-driven state`,
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobId,
          },
        );
      }
    }

    this.loggerService.debug(
      `${caller} returning processing state via fallback`,
      { jobId },
    );

    return {
      status: 'processing',
    };
  }

  // === Voices / TTS ===

  /**
   * Get available TTS voices from the self-hosted fleet first, then ElevenLabs.
   */
  async getVoices(): Promise<
    { name: string; preview?: string; voiceId: string }[]
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    const voiceProfiles = await this.fleetService.getVoiceProfiles();
    if (voiceProfiles && voiceProfiles.length > 0) {
      return voiceProfiles.map((voice) => ({
        name: voice.label,
        preview: voice.sampleUrl,
        voiceId: voice.handle,
      }));
    }

    return this.elevenLabsService.getVoices();
  }

  /**
   * Generate TTS audio using the self-hosted fleet first, then ElevenLabs.
   */
  async generateVoice(
    organizationId: string,
    data: {
      personaSlug?: string;
      text: string;
      voiceId: string;
      speed?: number;
    },
  ): Promise<{ audioUrl: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      textLength: data.text.length,
      voiceId: data.voiceId,
    });

    const referenceAudio = await this.resolveFleetReferenceAudio(
      organizationId,
      data.personaSlug,
    );

    const fleetResult = await this.fleetService.generateVoice({
      referenceAudio,
      text: data.text,
      voicePreset: data.voiceId,
    });

    if (fleetResult?.jobId) {
      const audioUrl = await this.pollFleetVoiceAudioUrl(fleetResult.jobId);
      if (audioUrl) {
        return { audioUrl };
      }

      this.loggerService.warn(caller, {
        jobId: fleetResult.jobId,
        message:
          'Fleet voice generation did not complete in time, falling back',
      });
    }

    const ingredientId = `tts-${Date.now()}`;
    const result = await this.elevenLabsService.generateAndUploadAudio(
      data.voiceId,
      data.text,
      ingredientId,
    );

    return {
      audioUrl: result.audioUrl,
    };
  }

  private async ingestTrainingDataForPersonaDocument(
    organizationId: string,
    userId: string,
    persona: PersonaDocument,
  ): Promise<DarkroomIngestResult> {
    const enabledSources =
      persona.darkroomSources?.filter((source) => source.enabled) ?? [];

    if (enabledSources.length === 0) {
      return {
        failed: [],
        failedCount: 0,
        uploadedCount: 0,
      };
    }

    const userObjectId = ObjectIdUtil.toObjectId(userId);
    const organizationObjectId = ObjectIdUtil.toObjectId(organizationId);
    const brandObjectId = ObjectIdUtil.toObjectId(persona.brand.toString());

    if (!userObjectId || !organizationObjectId || !brandObjectId) {
      throw new BadRequestException('Invalid darkroom ingest context');
    }

    let uploadedCount = 0;
    let failedCount = 0;
    const failed: DarkroomIngestFailure[] = [];

    for (const source of enabledSources) {
      try {
        const result = await this.scrapeSourcePosts(
          source.platform,
          source.handle,
        );
        const mediaPosts = result.posts.filter((post) => post.mediaUrl);

        for (const post of mediaPosts) {
          if (!post.mediaUrl) {
            continue;
          }

          const existing = await this.ingredientsService.findOne({
            brand: brandObjectId,
            category:
              post.mediaType === 'video'
                ? IngredientCategory.VIDEO
                : IngredientCategory.IMAGE,
            cdnUrl: post.mediaUrl,
            generationSource: `darkroom-ingest:${source.platform}`,
            isDeleted: false,
            organization: organizationObjectId,
            persona: persona._id,
          });

          if (existing) {
            continue;
          }

          const created = await this.createDarkroomIngestAsset({
            brandId: brandObjectId,
            mediaType: post.mediaType,
            organizationId: organizationObjectId,
            persona,
            postId: post.id,
            sourcePlatform: source.platform,
            sourceUrl: post.mediaUrl,
            text: post.text,
            userId: userObjectId,
          });

          if (created) {
            uploadedCount++;
          }
        }

        source.lastIngestedAt = new Date();
      } catch (error: unknown) {
        failedCount++;
        failed.push({
          error: getErrorMessage(error),
          filename: `${persona.slug ?? persona._id.toString()}:${source.platform}:${source.handle}`,
        });
      }
    }

    await this.personasService.patch(persona._id.toString(), {
      darkroomSources: persona.darkroomSources,
    } as Parameters<PersonasService['patch']>[1]);

    return {
      failed,
      failedCount,
      uploadedCount,
    };
  }

  private async createDarkroomIngestAsset(params: {
    organizationId: Types.ObjectId;
    brandId: Types.ObjectId;
    userId: Types.ObjectId;
    persona: PersonaDocument;
    sourcePlatform: ContentIntelligencePlatform;
    postId: string;
    sourceUrl: string;
    text: string;
    mediaType?: 'image' | 'video';
  }): Promise<IngredientDocument | null> {
    const category =
      params.mediaType === 'video'
        ? IngredientCategory.VIDEO
        : IngredientCategory.IMAGE;

    const ingredient = await this.ingredientsService.create({
      brand: params.brandId,
      category,
      cdnUrl: params.sourceUrl,
      ...this.getDefaultDarkroomModerationState(),
      generationPrompt: params.text || undefined,
      generationSource: `darkroom-ingest:${params.sourcePlatform}`,
      organization: params.organizationId,
      persona: params.persona._id,
      personaSlug: params.persona.slug,
      s3Key: `${params.sourcePlatform}:${params.postId}`,
      status: IngredientStatus.GENERATED,
      text: params.text || undefined,
      user: params.userId,
    } as Parameters<IngredientsService['create']>[0]);

    const uploadMeta = await this.filesClientService.uploadToS3(
      ingredient._id.toString(),
      category === IngredientCategory.VIDEO ? 'videos' : 'images',
      {
        type: FileInputType.URL,
        url: params.sourceUrl,
      },
    );

    return this.ingredientsService.patch(ingredient._id.toString(), {
      cdnUrl: params.sourceUrl,
      s3Key: uploadMeta.s3Key ?? ingredient.s3Key,
      status: IngredientStatus.GENERATED,
    } as Parameters<IngredientsService['patch']>[1]);
  }

  private async scrapeSourcePosts(
    platform: ContentIntelligencePlatform,
    handle: string,
  ) {
    if (
      platform !== ContentIntelligencePlatform.INSTAGRAM &&
      platform !== ContentIntelligencePlatform.TIKTOK
    ) {
      throw new BadRequestException(
        `Darkroom auto-ingest does not support ${platform} yet`,
      );
    }

    return this.creatorScraperService.scrapeByPlatform(platform, handle, 24);
  }

  private async syncApprovedAssetToDataset(
    organizationId: string,
    slug: string,
    ingredient: IngredientDocument,
  ): Promise<void> {
    const sourceUrl = ingredient.cdnUrl;
    if (!sourceUrl) {
      return;
    }

    const extension = this.getDatasetExtension(sourceUrl, ingredient.category);
    const datasetKey = `darkroom/datasets/${slug}/${ingredient._id.toString()}.${extension}`;
    await this.filesClientService.uploadToS3(datasetKey, 'images', {
      type: FileInputType.URL,
      url: sourceUrl,
    });

    const s3Keys = [datasetKey];
    const caption = ingredient.generationPrompt || ingredient.text;
    if (caption) {
      const captionKey = `darkroom/datasets/${slug}/${ingredient._id.toString()}.txt`;
      await this.filesClientService.uploadToS3(captionKey, 'images', {
        contentType: 'text/plain',
        data: Buffer.from(caption, 'utf8'),
        type: FileInputType.BUFFER,
      });
      s3Keys.push(captionKey);
    }

    await this.darkroomTrainingService.syncDataset(
      slug,
      s3Keys,
      this.configService.get('DARKROOM_S3_BUCKET') || undefined,
    );

    await this.ingredientsService.patch(ingredient._id.toString(), {
      generationCompletedAt: ingredient.generationCompletedAt ?? new Date(),
    } as Parameters<IngredientsService['patch']>[1]);
  }

  private getDatasetExtension(
    sourceUrl: string,
    category: string,
  ): 'jpg' | 'png' | 'webp' | 'mp4' {
    const normalizedUrl = sourceUrl.toLowerCase();
    if (normalizedUrl.includes('.png')) {
      return 'png';
    }
    if (normalizedUrl.includes('.webp')) {
      return 'webp';
    }
    if (
      category === IngredientCategory.VIDEO ||
      normalizedUrl.includes('.mp4')
    ) {
      return 'mp4';
    }
    return 'jpg';
  }

  private async resolveFleetReferenceAudio(
    organizationId: string,
    personaSlug?: string,
  ): Promise<string | undefined> {
    if (!personaSlug) {
      return undefined;
    }

    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug: personaSlug,
    });

    if (!persona?.voice) {
      return undefined;
    }

    const voiceIngredient = await this.ingredientsService.findOne({
      _id: persona.voice.toString(),
      isDeleted: false,
      organization: organizationId,
    });

    return voiceIngredient?.cdnUrl;
  }

  private async pollFleetVoiceAudioUrl(
    jobId: string,
  ): Promise<string | undefined> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await this.fleetService.pollJob('voices', jobId);
      const audioUrl = result?.audioUrl;
      if (typeof audioUrl === 'string' && audioUrl !== '') {
        return audioUrl;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 1500);
      });
    }

    return undefined;
  }
}
