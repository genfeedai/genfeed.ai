import type {
  IEmailDeliveryRequest,
  IEmailDeliveryResponse,
} from '@genfeedai/interfaces';
import {
  BadGatewayException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { InternalApiKeyGuard } from '@notifications/guards/internal-api-key.guard';
import {
  ResendEmailDeliveryError,
  ResendService,
} from '@notifications/services/resend/resend.service';

@Controller('internal/email-deliveries')
@UseGuards(InternalApiKeyGuard)
export class EmailDeliveriesController {
  constructor(private readonly resendService: ResendService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async deliver(
    @Body() payload: IEmailDeliveryRequest,
  ): Promise<IEmailDeliveryResponse> {
    try {
      const emailId = await this.resendService.sendEmail(payload);

      if (!emailId) {
        throw new ServiceUnavailableException(
          'Email delivery is not configured',
        );
      }

      return { emailId };
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof ResendEmailDeliveryError) {
        if (error.retryable) {
          throw new ServiceUnavailableException(
            'Email delivery is temporarily unavailable',
          );
        }

        throw new BadGatewayException('Email provider rejected delivery');
      }

      throw error;
    }
  }
}
