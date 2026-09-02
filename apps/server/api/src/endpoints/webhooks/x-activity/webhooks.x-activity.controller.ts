import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { XActivityWebhookService } from '@api/services/reply-bot/x-activity-webhook.service';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Optional,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * X Activity / Account Activity webhook pipe.
 * Register URL (when connecting): POST/GET /v1/webhooks/x-activity
 */
@ApiTags('Webhooks')
@AutoSwagger()
@Public()
@Controller('webhooks/x-activity')
export class XActivityWebhookController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    @Optional()
    private readonly xActivityWebhookService:
      | XActivityWebhookService
      | undefined,
    private readonly logger: LoggerService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /**
   * CRC challenge (webhook registration).
   */
  @Get()
  @ApiOperation({ summary: 'X webhook CRC challenge' })
  handleCrc(@Query('crc_token') crcToken?: string) {
    if (!crcToken?.trim()) {
      throw new BadRequestException('crc_token is required');
    }

    try {
      return this.resolveService().handleCrcChallenge(crcToken.trim());
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} CRC failed`, {
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw new ServiceUnavailableException(
        'X webhook consumer secret is not configured',
      );
    }
  }

  /**
   * Event delivery. When X_ACTIVITY_WEBHOOK_ENABLED is off, accepts and no-ops.
   */
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'X Activity / Account Activity event intake' })
  async handleEvent(@Body() body: unknown): Promise<{
    enqueued: number;
    ignored: number;
    mode: string;
    status: string;
  }> {
    const result = await this.resolveService().handleEventPayload(body);
    return {
      enqueued: result.enqueued,
      ignored: result.ignored,
      mode: result.mode,
      status: 'accepted',
    };
  }

  private resolveService(): XActivityWebhookService {
    if (this.xActivityWebhookService) {
      return this.xActivityWebhookService;
    }
    try {
      const resolved = this.moduleRef?.get(XActivityWebhookService, {
        strict: false,
      });
      if (resolved) {
        return resolved;
      }
    } catch {
      // Converted below to a stable API error.
    }
    throw new ServiceUnavailableException(
      'X webhook processing is unavailable',
    );
  }
}
