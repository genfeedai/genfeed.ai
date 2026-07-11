import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  ManagedInferenceOperation,
  ManagedInferenceProvider,
  type ManagedInferenceRequestDto,
  type ManagedInferenceVideoInput,
} from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import type {
  ManagedInferenceAuthenticatedRequest,
  ManagedInferenceResponse,
} from '@api/endpoints/v1/managed-inference/interfaces/managed-inference.interfaces';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { ActivitySource } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { PollTimeoutException } from '@server/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@server/shared/services/poll-until/poll-until.service';

const DEFAULT_MANAGED_INFERENCE_CREDITS = 1;
const MANAGED_INFERENCE_REFUND_DAYS = 30;
const MANAGED_VIDEO_POLL_INTERVAL_MS = 10_000;
const MANAGED_VIDEO_TIMEOUT_MS = 600_000;

@Injectable()
export class ManagedInferenceService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly falService: FalService,
    private readonly fleetService: FleetService,
    private readonly leonardoAIService: LeonardoAIService,
    private readonly replicateService: ReplicateService,
    private readonly loggerService: LoggerService,
    private readonly pollUntilService: PollUntilService,
  ) {}

  async execute(
    dto: ManagedInferenceRequestDto,
    request: ManagedInferenceAuthenticatedRequest,
  ): Promise<ManagedInferenceResponse> {
    const organizationId = request.user?.publicMetadata?.organization;
    const userId = request.user?.publicMetadata?.user ?? request.user?.id;
    const credits = dto.credits ?? DEFAULT_MANAGED_INFERENCE_CREDITS;

    if (!organizationId || !userId) {
      throw new UnauthorizedException('Managed inference API key is invalid');
    }

    await this.assertOperationSupported(dto, organizationId);

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        credits,
      );

    if (!hasCredits) {
      throw new HttpException(
        {
          detail: `Available managed inference credits are below the required ${credits} credits.`,
          title: 'Insufficient managed inference credits',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      userId,
      credits,
      `Managed inference ${dto.operation} ${dto.provider}:${dto.model}`,
      this.getActivitySource(dto),
    );

    try {
      const output = await this.executeProvider(dto, organizationId);

      return {
        creditsDebited: credits,
        model: dto.model,
        operation: dto.operation,
        output,
        provider: dto.provider,
      };
    } catch (error: unknown) {
      await this.refundCredits(organizationId, credits, dto);
      throw error;
    }
  }

  private async executeProvider(
    dto: ManagedInferenceRequestDto,
    organizationId: string,
  ): Promise<unknown> {
    if (dto.operation === ManagedInferenceOperation.VIDEO) {
      return await this.executeVideoProvider(dto, organizationId);
    }

    return await this.executeImageProvider(dto);
  }

  private async executeImageProvider(
    dto: ManagedInferenceRequestDto,
  ): Promise<unknown> {
    if (dto.provider === ManagedInferenceProvider.FAL) {
      return await this.falService.generateImage(dto.model, dto.input);
    }

    if (dto.provider === ManagedInferenceProvider.LEONARDO) {
      const prompt =
        typeof dto.input.prompt === 'string' ? dto.input.prompt : '';

      if (!prompt) {
        throw new BadRequestException(
          'Leonardo managed inference requires a prompt',
        );
      }

      return await this.leonardoAIService.generateImage(prompt, {
        height: this.getNumber(dto.input.height) ?? 1024,
        style: this.getString(dto.input.style) ?? 'photorealistic',
        width: this.getNumber(dto.input.width) ?? 1024,
      });
    }

    if (dto.provider === ManagedInferenceProvider.REPLICATE) {
      return await this.replicateService.runModel(dto.model, dto.input);
    }

    throw new BadRequestException(
      `Unsupported managed inference provider: ${dto.provider}`,
    );
  }

  private async executeVideoProvider(
    dto: ManagedInferenceRequestDto,
    organizationId: string,
  ): Promise<unknown> {
    if (dto.provider === ManagedInferenceProvider.FAL) {
      return await this.falService.generateVideo(dto.model, dto.input);
    }

    if (dto.provider === ManagedInferenceProvider.REPLICATE) {
      return await this.replicateService.runModel(dto.model, dto.input);
    }

    if (dto.provider === ManagedInferenceProvider.GENFEEDAI) {
      return await this.executeGenfeedVideo(dto, organizationId);
    }

    throw new BadRequestException(
      `Unsupported managed inference video provider: ${dto.provider}`,
    );
  }

  private async executeGenfeedVideo(
    dto: ManagedInferenceRequestDto,
    organizationId: string,
  ): Promise<unknown> {
    const input = this.validateVideoInput(dto.input);
    const imageUrl = this.getString(input.imageUrl ?? input.image_url);

    if (!imageUrl) {
      throw new BadRequestException(
        'GenfeedAI managed video inference requires imageUrl',
      );
    }

    const job = await this.fleetService.generateManagedVideoForOrg({
      fps: this.getNumber(input.fps),
      height: this.getNumber(input.height),
      imageUrl,
      negativePrompt: this.getString(
        input.negativePrompt ?? input.negative_prompt,
      ),
      organizationId,
      prompt: input.prompt,
      seed: this.getNumber(input.seed),
      width: this.getNumber(input.width),
    });

    if (!job) {
      throw new BadRequestException(
        'GenfeedAI managed video provider is not available',
      );
    }

    return await this.waitForManagedVideo(organizationId, job.jobId);
  }

  private getNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private async waitForManagedVideo(
    organizationId: string,
    jobId: string,
  ): Promise<{ jobId: string; url: string }> {
    // Poll the fleet job until it reaches a terminal state. Failure is raised
    // from the predicate so it surfaces as a BadRequest rather than a timeout.
    try {
      const { value: status } = await this.pollUntilService.poll(
        () =>
          this.fleetService.pollManagedJobForOrg(
            organizationId,
            'videos',
            jobId,
          ),
        (jobStatus) => {
          const state = this.getString(jobStatus?.status);
          if (state === 'failed' || state === 'error') {
            throw new BadRequestException(
              `GenfeedAI managed video job ${jobId} failed`,
            );
          }
          return state === 'completed' || state === 'succeeded';
        },
        {
          intervalMs: MANAGED_VIDEO_POLL_INTERVAL_MS,
          timeoutMs: MANAGED_VIDEO_TIMEOUT_MS,
        },
      );

      const url = this.extractVideoUrl(status);
      if (!url) {
        throw new BadRequestException(
          `GenfeedAI managed video job ${jobId} completed without a video URL`,
        );
      }

      return { jobId, url };
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new BadRequestException(
          `GenfeedAI managed video job ${jobId} timed out`,
        );
      }
      throw error;
    }
  }

  private extractVideoUrl(
    status: Record<string, unknown> | null,
  ): string | undefined {
    if (!status) {
      return undefined;
    }

    const directUrl =
      status.url ?? status.video_url ?? status.output_url ?? status.outputUrl;
    if (typeof directUrl === 'string') {
      return directUrl;
    }

    const output = status.output;
    if (output && typeof output === 'object' && !Array.isArray(output)) {
      return this.extractVideoUrl(output as Record<string, unknown>);
    }

    return undefined;
  }

  private validateVideoInput(
    input: Record<string, unknown>,
  ): ManagedInferenceVideoInput {
    const prompt = this.getString(input.prompt);
    if (!prompt) {
      throw new BadRequestException(
        'Managed video inference requires a prompt',
      );
    }

    return { ...input, prompt } as ManagedInferenceVideoInput;
  }

  private async assertOperationSupported(
    dto: ManagedInferenceRequestDto,
    organizationId: string,
  ): Promise<void> {
    if (dto.operation === ManagedInferenceOperation.IMAGE) {
      if (dto.provider === ManagedInferenceProvider.GENFEEDAI) {
        throw new BadRequestException(
          'GenfeedAI managed image inference is not supported yet',
        );
      }
      return;
    }

    if (dto.operation === ManagedInferenceOperation.VIDEO) {
      this.validateVideoInput(dto.input);

      if (
        dto.provider !== ManagedInferenceProvider.FAL &&
        dto.provider !== ManagedInferenceProvider.REPLICATE &&
        dto.provider !== ManagedInferenceProvider.GENFEEDAI
      ) {
        throw new BadRequestException(
          `Unsupported managed inference video provider: ${dto.provider}`,
        );
      }

      if (dto.provider === ManagedInferenceProvider.GENFEEDAI) {
        const enabled = await this.fleetService.hasDedicatedInstanceForOrg(
          organizationId,
          'videos',
        );

        if (!enabled) {
          throw new ForbiddenException(
            'GenfeedAI managed video provider is not enabled for this organization',
          );
        }
      }

      return;
    }

    throw new BadRequestException(
      `Unsupported managed inference operation: ${dto.operation}`,
    );
  }

  private getActivitySource(dto: ManagedInferenceRequestDto): ActivitySource {
    return dto.operation === ManagedInferenceOperation.VIDEO
      ? ActivitySource.VIDEO_GENERATION
      : ActivitySource.IMAGE_GENERATION;
  }

  private async refundCredits(
    organizationId: string,
    credits: number,
    dto: ManagedInferenceRequestDto,
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MANAGED_INFERENCE_REFUND_DAYS);

    try {
      await this.creditsUtilsService.refundOrganizationCredits(
        organizationId,
        credits,
        'managed_inference',
        `Managed inference refund ${dto.provider}:${dto.model}`,
        expiresAt,
      );
    } catch (refundError: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to refund managed inference credits`,
        refundError,
        {
          credits,
          model: dto.model,
          organizationId,
          provider: dto.provider,
        },
      );
    }
  }
}
