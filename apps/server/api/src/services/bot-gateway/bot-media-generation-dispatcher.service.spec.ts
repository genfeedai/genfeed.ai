import type { AgentGenerationGatewayService } from '@api/services/agent-generation-gateway/agent-generation-gateway.service';
import { BotMediaGenerationDispatcherService } from '@api/services/bot-gateway/bot-media-generation-dispatcher.service';
import { ActivitySource, BotCommandType } from '@genfeedai/contracts';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

const user = {
  brandId: 'brand-1',
  credentialId: 'credential-1',
  organizationId: 'org-1',
  userId: 'user-1',
};
const onPlaceholderCreated = async () => undefined;

/**
 * The shared generation gateway, recording every image and video dispatch and
 * answering with a JSON:API ingredient (or `emptyResponse` with no data).
 */
function buildService(options: { emptyResponse?: boolean } = {}) {
  const dispatched: { kind: 'image' | 'video'; request: unknown }[] = [];
  const respond = (kind: 'image' | 'video', request: unknown) => {
    dispatched.push({ kind, request });
    return Promise.resolve(
      options.emptyResponse
        ? { data: null }
        : { data: { attributes: {}, id: `${kind}-1`, type: `${kind}s` } },
    );
  };
  const gateway = {
    generateImage: (request: unknown) => respond('image', request),
    generateVideo: (request: unknown) => respond('video', request),
  };
  return {
    dispatched,
    service: new BotMediaGenerationDispatcherService(
      gateway as unknown as AgentGenerationGatewayService,
    ),
  };
}

const attribution = {
  description: 'Bot media generation',
  source: ActivitySource.BOT_GENERATION,
};

describe('BotMediaGenerationDispatcherService', () => {
  it('dispatches image generation through the shared generation gateway', async () => {
    const { dispatched, service } = buildService();

    await expect(
      service.generate({
        command: BotCommandType.PROMPT_IMAGE,
        onPlaceholderCreated,
        prompt: 'a product launch',
        user,
      }),
    ).resolves.toEqual({ ingredientId: 'image-1' });

    expect(dispatched).toEqual([
      {
        kind: 'image',
        request: {
          body: {
            brandId: 'brand-1',
            brandingMode: 'brand',
            isBrandingEnabled: true,
            outputs: 1,
            text: 'a product launch',
            waitForCompletion: false,
          },
          creditsAttribution: attribution,
          onPlaceholderCreated,
          principal: {
            brandId: 'brand-1',
            organizationId: 'org-1',
            userId: 'user-1',
          },
        },
      },
    ]);
  });

  it('dispatches video generation through the shared generation gateway', async () => {
    const { dispatched, service } = buildService();

    await expect(
      service.generate({
        command: BotCommandType.PROMPT_VIDEO,
        onPlaceholderCreated,
        prompt: 'a product launch',
        user,
      }),
    ).resolves.toEqual({ ingredientId: 'video-1' });

    expect(dispatched).toEqual([
      {
        kind: 'video',
        request: expect.objectContaining({
          creditsAttribution: attribution,
          onPlaceholderCreated,
        }),
      },
    ]);
  });

  it('rejects a generation response without a durable ingredient id', async () => {
    const { service } = buildService({ emptyResponse: true });

    await expect(
      service.generate({
        command: BotCommandType.PROMPT_IMAGE,
        onPlaceholderCreated,
        prompt: 'a product launch',
        user,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects commands outside the media-generation boundary', async () => {
    const { dispatched, service } = buildService();

    await expect(
      service.generate({
        command: BotCommandType.STATUS,
        onPlaceholderCreated,
        prompt: 'status',
        user,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dispatched).toEqual([]);
  });
});
