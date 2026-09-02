import { AgentGenerationGatewayService } from '@api/services/agent-generation-gateway/agent-generation-gateway.service';
import { BotMediaGenerationDispatcherService } from '@api/services/bot-gateway/bot-media-generation-dispatcher.service';
import { ActivitySource, BotCommandType } from '@genfeedai/enums';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('BotMediaGenerationDispatcherService', () => {
  const request = {} as Request;
  const user = {
    brandId: 'brand-1',
    credentialId: 'credential-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const onPlaceholderCreated = vi.fn().mockResolvedValue(undefined);

  let service: BotMediaGenerationDispatcherService;
  let generationGateway: vi.Mocked<
    Pick<AgentGenerationGatewayService, 'generateImage' | 'generateVideo'>
  >;

  beforeEach(async () => {
    generationGateway = {
      generateImage: vi.fn().mockResolvedValue({
        data: { attributes: {}, id: 'image-1', type: 'images' },
      }),
      generateVideo: vi.fn().mockResolvedValue({
        data: { attributes: {}, id: 'video-1', type: 'videos' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotMediaGenerationDispatcherService,
        {
          provide: AgentGenerationGatewayService,
          useValue: generationGateway,
        },
      ],
    }).compile();

    service = module.get(BotMediaGenerationDispatcherService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches image generation through the shared generation gateway', async () => {
    await expect(
      service.generate({
        command: BotCommandType.PROMPT_IMAGE,
        onPlaceholderCreated,
        prompt: 'a product launch',
        request,
        user,
      }),
    ).resolves.toEqual({ ingredientId: 'image-1' });

    expect(generationGateway.generateImage).toHaveBeenCalledWith({
      body: {
        brandId: 'brand-1',
        brandingMode: 'brand',
        isBrandingEnabled: true,
        outputs: 1,
        text: 'a product launch',
        waitForCompletion: false,
      },
      creditsAttribution: {
        description: 'Bot media generation',
        source: ActivitySource.BOT_GENERATION,
      },
      onPlaceholderCreated,
      principal: {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
    expect(generationGateway.generateVideo).not.toHaveBeenCalled();
  });

  it('dispatches video generation through the shared generation gateway', async () => {
    await expect(
      service.generate({
        command: BotCommandType.PROMPT_VIDEO,
        onPlaceholderCreated,
        prompt: 'a product launch',
        request,
        user,
      }),
    ).resolves.toEqual({ ingredientId: 'video-1' });

    expect(generationGateway.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsAttribution: {
          description: 'Bot media generation',
          source: ActivitySource.BOT_GENERATION,
        },
        onPlaceholderCreated,
      }),
    );
    expect(generationGateway.generateImage).not.toHaveBeenCalled();
  });

  it('rejects a generation response without a durable ingredient id', async () => {
    generationGateway.generateImage.mockResolvedValueOnce({ data: null });

    await expect(
      service.generate({
        command: BotCommandType.PROMPT_IMAGE,
        onPlaceholderCreated,
        prompt: 'a product launch',
        request,
        user,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects commands outside the media-generation boundary', async () => {
    await expect(
      service.generate({
        command: BotCommandType.STATUS,
        onPlaceholderCreated,
        prompt: 'status',
        request,
        user,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(generationGateway.generateImage).not.toHaveBeenCalled();
    expect(generationGateway.generateVideo).not.toHaveBeenCalled();
  });
});
