import type {
  IEmailDeliveryErrorResponse,
  IEmailDeliveryRequest,
  IEmailDeliveryResponse,
} from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
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
        throw new ServiceUnavailableException({
          message: 'Email delivery is not configured',
          retryable: true,
        } satisfies IEmailDeliveryErrorResponse);
      }

      return { emailId };
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof ResendEmailDeliveryError) {
        if (error.retryable) {
          throw new ServiceUnavailableException({
            message: 'Email delivery is temporarily unavailable',
            retryable: true,
          } satisfies IEmailDeliveryErrorResponse);
        }

        throw new UnprocessableEntityException({
          message: 'Email provider rejected delivery',
          retryable: false,
        } satisfies IEmailDeliveryErrorResponse);
      }

      throw error;
    }
  }
}
