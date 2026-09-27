import type {
  IChannelDeliveryRequest,
  IChannelDeliveryResponse,
  IEmailDeliveryErrorResponse,
} from '@genfeedai/contracts/interfaces';
import { CHANNEL_MESSAGE_TYPES } from '@genfeedai/contracts/interfaces';
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
  ChannelMessageDispatcherService,
  InvalidChannelMessageError,
} from '@notifications/services/channel-deliveries/channel-message-dispatcher.service';
import { ResendEmailDeliveryError } from '@notifications/services/resend/resend.service';

function readRequest(body: unknown): IChannelDeliveryRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const idempotencyKey: unknown = Reflect.get(body, 'idempotencyKey');
  const destination: unknown = Reflect.get(body, 'destination');
  const message: unknown = Reflect.get(body, 'message');
  if (
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.length === 0 ||
    idempotencyKey.length > 512 ||
    (destination !== null &&
      (typeof destination !== 'string' || destination.length > 320)) ||
    !message ||
    typeof message !== 'object'
  ) {
    return null;
  }
  const type: unknown = Reflect.get(message, 'type');
  const action: unknown = Reflect.get(message, 'action');
  const payload: unknown = Reflect.get(message, 'payload');
  const channel = CHANNEL_MESSAGE_TYPES.find((entry) => entry === type);
  if (
    !channel ||
    typeof action !== 'string' ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return null;
  }
  return {
    destination,
    idempotencyKey,
    message: {
      action,
      payload: payload as IChannelDeliveryRequest['message']['payload'],
      type: channel,
    },
  };
}

/**
 * Internal endpoint the API's durable delivery worker calls for every channel
 * delivery (Discord, Telegram, Slack, explicit email). It replaced the Redis
 * `notifications` subscription (#5197): the worker owns retry and dedup.
 */
@Controller('internal/channel-deliveries')
@UseGuards(InternalApiKeyGuard)
export class ChannelDeliveriesController {
  constructor(private readonly dispatcher: ChannelMessageDispatcherService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async deliver(@Body() body: unknown): Promise<IChannelDeliveryResponse> {
    const request = readRequest(body);
    if (!request) {
      throw new UnprocessableEntityException({
        message: 'Invalid channel delivery',
        retryable: false,
      } satisfies IEmailDeliveryErrorResponse);
    }
    try {
      return await this.dispatcher.dispatch(request);
    } catch (error: unknown) {
      if (
        error instanceof InvalidChannelMessageError ||
        (error instanceof ResendEmailDeliveryError && !error.retryable)
      ) {
        throw new UnprocessableEntityException({
          message:
            error instanceof InvalidChannelMessageError
              ? error.message
              : 'Email provider rejected delivery',
          retryable: false,
        } satisfies IEmailDeliveryErrorResponse);
      }
      throw new ServiceUnavailableException({
        message: 'Channel delivery is temporarily unavailable',
        retryable: true,
      } satisfies IEmailDeliveryErrorResponse);
    }
  }
}
