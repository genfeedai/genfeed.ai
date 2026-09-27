import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChannelDeliveriesController } from '@notifications/services/channel-deliveries/channel-deliveries.controller';
import { InvalidChannelMessageError } from '@notifications/services/channel-deliveries/channel-message-dispatcher.service';
import { ResendEmailDeliveryError } from '@notifications/services/resend/resend.service';

function setup() {
  const dispatcher = {
    dispatch: vi
      .fn()
      .mockResolvedValue({ messageId: 'message-1', status: 'delivered' }),
  };
  return {
    controller: new ChannelDeliveriesController(dispatcher as never),
    dispatcher,
  };
}

const body = {
  destination: 'chat-1',
  idempotencyKey: 'delivery/1',
  message: {
    action: 'send_message',
    payload: { chatId: 'chat-1', message: 'hi' },
    type: 'telegram',
  },
};

describe('ChannelDeliveriesController', () => {
  it('dispatches a well-formed delivery and returns its outcome', async () => {
    const { controller, dispatcher } = setup();

    await expect(controller.deliver(body)).resolves.toEqual({
      messageId: 'message-1',
      status: 'delivered',
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(body);
  });

  it.each([
    null,
    { ...body, idempotencyKey: '' },
    { ...body, destination: 42 },
    { ...body, message: { ...body.message, type: 'bot' } },
    { ...body, message: { ...body.message, payload: [] } },
  ])('rejects a malformed delivery as non-retryable', async (invalid) => {
    const { controller, dispatcher } = setup();

    await expect(controller.deliver(invalid)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('maps invalid messages and permanent provider rejections to 422', async () => {
    const { controller, dispatcher } = setup();

    dispatcher.dispatch.mockRejectedValueOnce(
      new InvalidChannelMessageError('Unsupported message action'),
    );
    await expect(controller.deliver(body)).rejects.toMatchObject({
      response: { message: 'Unsupported message action', retryable: false },
    });

    dispatcher.dispatch.mockRejectedValueOnce(
      new ResendEmailDeliveryError('bad address', {
        providerCode: null,
        retryable: false,
        statusCode: 422,
      }),
    );
    await expect(controller.deliver(body)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('maps transient provider failures to a retryable 503', async () => {
    const { controller, dispatcher } = setup();
    dispatcher.dispatch.mockRejectedValue(new Error('discord down'));

    await expect(controller.deliver(body)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
