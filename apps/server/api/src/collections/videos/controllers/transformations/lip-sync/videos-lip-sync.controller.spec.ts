import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn(() => 'createLipSyncVideo'),
  },
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosLipSyncController } from '@api/collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller';
import { CreateLipSyncDto } from '@api/collections/videos/dto/create-lip-sync.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const brandId = testId('brand');
const organizationId = testId('org');
const userId = testId('user');
const otherBrandId = testId('brand', 2);
const imageIngredientId = testId('ingredient', 1);
const audioIngredientId = testId('ingredient', 2);
const ingredientDataId = testId('ingredientdata');
const metadataDataId = testId('metadata');

function heygenConnection(kind: 'byok' | 'platform') {
  return {
    apiKey: `${kind}-heygen-key`,
    binding: {
      credentialVersionId: 'version-1',
      kind,
      organizationId,
      provider: 'heygen',
    },
  };
}

describe('VideosLipSyncController', () => {
  let controller: VideosLipSyncController;

  const mockReq = {} as Request;

  const mockUser = {
    id: 'user_authProvider_123',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockImageIngredient = {
    brandId: otherBrandId,
    category: IngredientCategory.IMAGE,
    id: imageIngredientId,
    organization: organizationId,
    status: IngredientStatus.GENERATED,
  };

  const mockAudioIngredient = {
    category: IngredientCategory.AUDIO,
    id: audioIngredientId,
    organization: organizationId,
    status: IngredientStatus.GENERATED,
  };

  const mockIngredientData = {
    id: ingredientDataId,
  };

  const mockMetadataData = {
    id: metadataDataId,
  };

  const mockDto: CreateLipSyncDto = {
    parent: imageIngredientId,
    voice: audioIngredientId,
  };

  let avatarBilling: {
    bindRender: ReturnType<typeof vi.fn>;
    fundLipSync: ReturnType<typeof vi.fn>;
    recordSubmissionRejection: ReturnType<typeof vi.fn>;
    releaseGenerationHold: ReturnType<typeof vi.fn>;
    releasePool: ReturnType<typeof vi.fn>;
  };
  let byokService: { resolveApiKey: ReturnType<typeof vi.fn> };
  let failedGenerationService: {
    handleFailedVideoGeneration: ReturnType<typeof vi.fn>;
  };
  let heygenService: {
    generatePhotoAvatarVideo: ReturnType<typeof vi.fn>;
    resolveOrganizationConnection: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let sharedService: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let websocketService: {
    publishFileProcessing: ReturnType<typeof vi.fn>;
    publishVideoProgress: ReturnType<typeof vi.fn>;
  };

  let personas: PersonasService;

  beforeEach(async () => {
    personas = personasServiceStub();
    avatarBilling = {
      bindRender: vi.fn().mockResolvedValue(undefined),
      fundLipSync: vi.fn(async (input: { useCustomerKey: boolean }) =>
        input.useCustomerKey
          ? {
              funding: {
                billingMode: 'byok',
                credits: 0,
                modelKey: 'heygen/avatar',
              },
            }
          : {
              funding: {
                billingMode: 'platform',
                credits: 65,
                durationQuote: {
                  estimatedSeconds: 5,
                  snapshot: { credits: 65 },
                },
                modelKey: 'heygen/avatar',
              },
              request: { creditsConfig: { amount: 65 } },
            },
      ),
      recordSubmissionRejection: vi.fn().mockResolvedValue(undefined),
      releaseGenerationHold: vi.fn().mockResolvedValue(undefined),
      releasePool: vi.fn().mockResolvedValue(undefined),
    };
    byokService = { resolveApiKey: vi.fn().mockResolvedValue(null) };
    failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    heygenService = {
      generatePhotoAvatarVideo: vi
        .fn()
        .mockResolvedValue('heygen-video-id-abc'),
      resolveOrganizationConnection: vi
        .fn()
        .mockResolvedValue(heygenConnection('platform')),
    };
    ingredientsService = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(mockImageIngredient)
        .mockResolvedValueOnce(mockAudioIngredient),
    };
    metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    sharedService = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: mockIngredientData,
        metadataData: mockMetadataData,
      }),
    };
    websocketService = {
      publishFileProcessing: vi.fn().mockResolvedValue(undefined),
      publishVideoProgress: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosLipSyncController],
      providers: [
        { provide: GenerationQuoteGroupService, useValue: {} },
        { provide: AvatarVideoBillingService, useValue: avatarBilling },
        { provide: ByokService, useValue: byokService },
        // CreditsInterceptor is now bound to the handler (@UseInterceptors); Nest
        // instantiates it at module compile, so its queue dependency must resolve.
        // It never runs here — controller methods are invoked directly.
        {
          provide: CreditDeductionQueueService,
          useValue: { queueByokUsage: vi.fn(), queueDeduction: vi.fn() },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            releaseReservation: vi.fn(),
            reserveCredits: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), ingredientsEndpoint: 'http://localhost' },
        },
        {
          provide: FailedGenerationService,
          useValue: failedGenerationService,
        },
        {
          provide: HeyGenService,
          useValue: heygenService,
        },
        { provide: IngredientsService, useValue: ingredientsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: MetadataService, useValue: metadataService },
        { provide: PersonasService, useValue: personas },
        { provide: SharedService, useValue: sharedService },
        {
          provide: VideosService,
          useValue: { findOne: vi.fn(), patch: vi.fn() },
        },
        {
          provide: NotificationsPublisherService,
          useValue: websocketService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VideosLipSyncController>(VideosLipSyncController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('holds the per-second photo quote before HeyGen accepts the job', async () => {
    await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

    expect(avatarBilling.fundLipSync).toHaveBeenCalledWith(
      expect.objectContaining({
        audioIngredientId: audioIngredientId,
        audioUrl: `http://localhost/audios/${audioIngredientId}`,
        organizationId,
        useCustomerKey: false,
        userId,
      }),
    );
    expect(avatarBilling.bindRender).toHaveBeenCalledWith(
      expect.objectContaining({ creditsConfig: { amount: 65 } }),
      expect.objectContaining({ billingMode: 'platform', credits: 65 }),
      ingredientDataId,
    );
    expect(avatarBilling.bindRender.mock.invocationCallOrder[0]).toBeLessThan(
      heygenService.generatePhotoAvatarVideo.mock.invocationCallOrder[0],
    );
    expect(avatarBilling.releasePool).toHaveBeenCalled();
    expect(avatarBilling.releaseGenerationHold).not.toHaveBeenCalled();
  });

  it('refuses an unpriced voice before creating an output', async () => {
    avatarBilling.fundLipSync.mockRejectedValueOnce(
      new HttpException('Add a saved narration with a known length', 400),
    );

    await expect(
      controller.createLipSyncVideo(mockReq, mockUser, mockDto),
    ).rejects.toBeInstanceOf(HttpException);
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
  });

  it('skips the platform hold when the organization uses its own HeyGen key', async () => {
    heygenService.resolveOrganizationConnection.mockResolvedValue(
      heygenConnection('byok'),
    );

    await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

    expect(avatarBilling.fundLipSync).toHaveBeenCalledWith(
      expect.objectContaining({ useCustomerKey: true }),
    );
    expect(avatarBilling.bindRender).not.toHaveBeenCalled();
  });

  describe('one HeyGen connection for billing and dispatch (#6932)', () => {
    it('renders on the customer key it billed as BYOK, even when a lenient key read misses', async () => {
      // A transient failure the lenient BYOK read swallows used to price the
      // render as platform while the dispatch re-read found the customer key.
      byokService.resolveApiKey.mockResolvedValue(undefined);
      heygenService.resolveOrganizationConnection.mockResolvedValue(
        heygenConnection('byok'),
      );

      await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

      expect(heygenService.resolveOrganizationConnection).toHaveBeenCalledTimes(
        1,
      );
      expect(heygenService.resolveOrganizationConnection).toHaveBeenCalledWith(
        organizationId,
      );
      expect(avatarBilling.fundLipSync).toHaveBeenCalledWith(
        expect.objectContaining({ useCustomerKey: true }),
      );
      expect(avatarBilling.bindRender).not.toHaveBeenCalled();
      expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
        ingredientDataId,
        expect.any(String),
        expect.any(String),
        organizationId,
        userId,
        'byok-heygen-key',
      );
    });

    it('charges nothing and renders nothing when the key lookup fails', async () => {
      heygenService.resolveOrganizationConnection.mockRejectedValue(
        new Error('settings read timed out'),
      );

      await expect(
        controller.createLipSyncVideo(mockReq, mockUser, mockDto),
      ).rejects.toBeInstanceOf(HttpException);
      expect(avatarBilling.fundLipSync).not.toHaveBeenCalled();
      expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
      expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
    });

    it('renders a platform-billed job on the platform key it priced', async () => {
      await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

      expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
        ingredientDataId,
        expect.any(String),
        expect.any(String),
        organizationId,
        userId,
        'platform-heygen-key',
      );
    });
  });

  describe('submission outcomes (#6932)', () => {
    it('keeps the hold when the submission times out after it was sent', async () => {
      heygenService.generatePhotoAvatarVideo.mockRejectedValue(
        new Error('timeout of 30000ms exceeded'),
      );

      await expect(
        controller.createLipSyncVideo(mockReq, mockUser, mockDto),
      ).rejects.toBeInstanceOf(HttpException);
      expect(avatarBilling.releaseGenerationHold).not.toHaveBeenCalled();
      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).not.toHaveBeenCalled();
      expect(avatarBilling.recordSubmissionRejection).not.toHaveBeenCalled();
    });

    it('records a definitive HeyGen rejection, fails the output and returns the hold', async () => {
      heygenService.generatePhotoAvatarVideo.mockRejectedValue(
        new HeyGenSubmissionRejectedError(),
      );

      await expect(
        controller.createLipSyncVideo(mockReq, mockUser, mockDto),
      ).rejects.toBeInstanceOf(HeyGenSubmissionRejectedError);
      expect(avatarBilling.recordSubmissionRejection).toHaveBeenCalledWith(
        ingredientDataId,
        organizationId,
      );
      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).toHaveBeenCalled();
      expect(avatarBilling.releaseGenerationHold).toHaveBeenCalledWith(
        ingredientDataId,
        organizationId,
      );
    });

    it('fails the output and returns the hold when it breaks before dispatch', async () => {
      avatarBilling.bindRender.mockRejectedValue(new Error('bind failed'));

      await expect(
        controller.createLipSyncVideo(mockReq, mockUser, mockDto),
      ).rejects.toBeInstanceOf(HttpException);
      expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).toHaveBeenCalled();
      expect(avatarBilling.releaseGenerationHold).toHaveBeenCalledWith(
        ingredientDataId,
        organizationId,
      );
    });
  });

  describe('character admission (#6040)', () => {
    it('refuses a character the brand lost before any output exists', async () => {
      vi.mocked(personas.resolveCharacterReferences).mockRejectedValueOnce(
        new NotFoundException('Reference image'),
      );

      await expect(
        controller.createLipSyncVideo(mockReq, mockUser, mockDto),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
      expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
    });

    it('links the admitted character to the output', async () => {
      vi.mocked(personas.resolveCharacterReferences).mockResolvedValueOnce({
        availableAvatarIds: new Set([mockDto.parent]),
        grantedAvatarOwners: new Map(),
        personaId: 'persona-1',
        personaIdByAssetId: new Map(),
      });

      await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ personaId: 'persona-1' }),
      );
    });
  });

  describe('createLipSyncVideo', () => {
    describe('happy path', () => {
      it('should return ingredient data on successful generation', async () => {
        const result = await controller.createLipSyncVideo(
          mockReq,
          mockUser,
          mockDto,
        );

        expect(result).toEqual(mockIngredientData);
      });

      it('should inherit ownership from the image ingredient brandId', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
          mockUser,
          expect.objectContaining({ brandId: mockImageIngredient.brandId }),
        );
      });

      it('should call HeyGen with resolved photo and audio URLs', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
          mockIngredientData.id,
          `http://localhost/images/${mockDto.parent}`,
          `http://localhost/audios/${mockDto.voice}`,
          organizationId,
          userId,
          'platform-heygen-key',
        );
      });

      it('should update metadata with HeyGen video ID', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(metadataService.patch).toHaveBeenCalledWith(
          mockMetadataData.id,
          expect.objectContaining({ externalId: 'heygen-video-id-abc' }),
        );
      });

      it('should publish websocket processing status', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(websocketService.publishVideoProgress).toHaveBeenCalledWith(
          WebSocketPaths.video(ingredientDataId),
          0,
          mockUser.id,
          `user:${mockUser.id}`,
        );
        expect(websocketService.publishFileProcessing).not.toHaveBeenCalled();
      });

      it('should resolve BYOK key when available', async () => {
        heygenService.resolveOrganizationConnection.mockResolvedValue(
          heygenConnection('byok'),
        );

        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'byok-heygen-key',
        );
      });

      it('should build audio URL with "videos" path for video audio ingredient', async () => {
        const videoAudioIngredient = {
          ...mockAudioIngredient,
          category: IngredientCategory.VIDEO,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(videoAudioIngredient);

        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          `http://localhost/videos/${mockDto.voice}`,
          expect.any(String),
          expect.any(String),
          'platform-heygen-key',
        );
      });
    });

    describe('image ingredient validation', () => {
      it('should throw 404 when image ingredient is not found', async () => {
        ingredientsService.findOne.mockReset().mockResolvedValue(null);

        await expect(
          controller.createLipSyncVideo(mockReq, mockUser, mockDto),
        ).rejects.toThrow(HttpException);
      });

      it('should return 404 status for missing image ingredient', async () => {
        ingredientsService.findOne.mockReset().mockResolvedValue(null);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(404);
        }
      });

      it('should throw 400 when image ingredient is not IMAGE category', async () => {
        const nonImageIngredient = {
          ...mockImageIngredient,
          category: IngredientCategory.VIDEO,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(nonImageIngredient)
          .mockResolvedValueOnce(mockAudioIngredient);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });

      it('should throw 400 when image ingredient has PROCESSING status', async () => {
        const processingImage = {
          ...mockImageIngredient,
          status: IngredientStatus.PROCESSING,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(processingImage)
          .mockResolvedValueOnce(mockAudioIngredient);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });

      it('should accept VALIDATED status for image ingredient', async () => {
        const validatedImage = {
          ...mockImageIngredient,
          status: IngredientStatus.VALIDATED,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(validatedImage)
          .mockResolvedValueOnce(mockAudioIngredient);

        const result = await controller.createLipSyncVideo(
          mockReq,
          mockUser,
          mockDto,
        );

        expect(result).toBeDefined();
      });
    });

    describe('audio ingredient validation', () => {
      it('should throw 404 when audio ingredient is not found', async () => {
        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(null);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(404);
        }
      });

      it('should throw 400 when audio ingredient has invalid category', async () => {
        const invalidAudio = {
          ...mockAudioIngredient,
          category: IngredientCategory.IMAGE,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(invalidAudio);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });

      it('should throw 400 when audio ingredient is not in a usable state', async () => {
        const processingAudio = {
          ...mockAudioIngredient,
          status: IngredientStatus.PROCESSING,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(processingAudio);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });
    });

    describe('generation failure', () => {
      it('should call failedGenerationService when HeyGen rejects the job', async () => {
        heygenService.generatePhotoAvatarVideo.mockRejectedValue(
          new HeyGenSubmissionRejectedError(),
        );

        await expect(
          controller.createLipSyncVideo(mockReq, mockUser, mockDto),
        ).rejects.toThrow(HttpException);

        expect(
          failedGenerationService.handleFailedVideoGeneration,
        ).toHaveBeenCalled();
      });

      it('should rethrow HttpException as-is', async () => {
        const originalException = new HttpException('Forbidden', 403);
        heygenService.generatePhotoAvatarVideo.mockRejectedValue(
          originalException,
        );

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBe(originalException);
          expect((err as HttpException).getStatus()).toBe(403);
        }
      });

      it('should wrap unknown errors in 500 HttpException', async () => {
        heygenService.generatePhotoAvatarVideo.mockRejectedValue(
          new Error('unexpected failure'),
        );

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(500);
        }
      });
    });
  });

  it('uses authorized image and audio URLs when media delivery is enabled', async () => {
    const imageUrl = 'https://cdn.example/random-image.png?Signature=image';
    const audioUrl = 'https://cdn.example/random-audio.wav?Signature=audio';
    const issueServerPublish = vi
      .fn()
      .mockImplementation(
        async (_org: string, ids: string[]) =>
          new Map(
            ids.map((id) => [
              id,
              id === imageIngredientId ? imageUrl : audioUrl,
            ]),
          ),
      );
    Object.defineProperty(controller, 'configService', {
      value: { isAuthorizedMediaDeliveryEnabled: true },
    });
    Object.defineProperty(controller, 'authorizedMediaUrls', {
      value: { issueServerPublish },
    });
    await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
    expect(issueServerPublish).toHaveBeenCalledWith(organizationId, [
      imageIngredientId,
    ]);
    expect(issueServerPublish).toHaveBeenCalledWith(organizationId, [
      audioIngredientId,
    ]);
    expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
      ingredientDataId,
      imageUrl,
      audioUrl,
      organizationId,
      userId,
      'platform-heygen-key',
    );
  });

  it('fails closed before the provider when an enabled source is unauthorized', async () => {
    Object.defineProperty(controller, 'configService', {
      value: { isAuthorizedMediaDeliveryEnabled: true },
    });
    Object.defineProperty(controller, 'authorizedMediaUrls', {
      value: {
        issueServerPublish: vi
          .fn()
          .mockRejectedValue(new Error('Source denied')),
      },
    });
    await expect(
      controller.createLipSyncVideo(mockReq, mockUser, mockDto),
    ).rejects.toThrow(HttpException);
    expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
  });
});
