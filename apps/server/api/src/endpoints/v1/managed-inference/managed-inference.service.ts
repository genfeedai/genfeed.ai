import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  ManagedInferenceOperation,
  ManagedInferenceProvider,
  type ManagedInferenceRequestDto,
} from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import type {
  ManagedInferenceAuthenticatedRequest,
  ManagedInferenceResponse,
} from '@api/endpoints/v1/managed-inference/interfaces/managed-inference.interfaces';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ActivitySource } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

const DEFAULT_MANAGED_INFERENCE_CREDITS = 1;
const MANAGED_INFERENCE_REFUND_DAYS = 30;

@Injectable()
export class ManagedInferenceService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly falService: FalService,
    private readonly leonardoAIService: LeonardoAIService,
    private readonly replicateService: ReplicateService,
    private readonly loggerService: LoggerService,
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

    if (dto.operation !== ManagedInferenceOperation.IMAGE) {
      throw new BadRequestException(
        `Unsupported managed inference operation: ${dto.operation}`,
      );
    }

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
      `Managed inference ${dto.provider}:${dto.model}`,
      ActivitySource.IMAGE_GENERATION,
    );

    try {
      const output = await this.executeProvider(dto);

      return {
        creditsDebited: credits,
        model: dto.model,
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
  ): Promise<Record<string, unknown> | string> {
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

  private getNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
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
