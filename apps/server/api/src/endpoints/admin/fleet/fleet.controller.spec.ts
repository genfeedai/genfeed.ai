vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  // Handle both (request, Serializer, data) and legacy (data, Serializer) call patterns
  serializeSingle: vi.fn((...args: unknown[]) =>
    args.length >= 3 ? args[2] : args[0],
  ),
}));

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error: unknown) => {
      throw error;
    }),
  },
}));

vi.mock('@api/helpers/utils/objectid/objectid.util', () => ({
  ObjectIdUtil: {
    toObjectId: vi.fn((s: unknown) => s),
  },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import {
  BulkEc2ActionDto,
  CloudFrontInvalidateDto,
  CreateCharacterDto,
  Ec2ActionDto,
  GenerateImageDto,
  PublishAssetDto,
  QueryAssetsDto,
  ReviewAssetDto,
  StartTrainingDto,
  UpdateCharacterDto,
} from '@api/endpoints/admin/fleet/dto';
import { AdminFleetController } from '@api/endpoints/admin/fleet/fleet.controller';
import { AdminFleetService } from '@api/endpoints/admin/fleet/fleet.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { LoggerService } from '@libs/logger/logger.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

describe('AdminFleetController', () => {
  let controller: AdminFleetController;
  let adminFleetService: vi.Mocked<AdminFleetService>;
  let fleetService: vi.Mocked<FleetService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      brand: 'brand_123',
      organization: 'org_123',
      user: 'user_123',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/admin/fleet',
    query: {},
  } as Request;

  beforeEach(() => {
    adminFleetService = {
      createCharacter: vi.fn(),
      createGenerationJob: vi.fn(),
      ec2Action: vi.fn(),
      ec2ActionAll: vi.fn(),
      generateImage: vi.fn(),
      generateLipSync: vi.fn(),
      generateVoice: vi.fn(),
      getAssets: vi.fn(),
      getCharacterBySlug: vi.fn(),
      getCharacters: vi.fn(),
      getDefaultCloudFrontDistributionId: vi.fn(() => 'EDEFAULT123'),
      getEC2Status: vi.fn(),
      getGenerationJob: vi.fn(),
      getLipSyncStatus: vi.fn(),
      getPipelineStats: vi.fn(),
      getServiceHealth: vi.fn(),
      getTraining: vi.fn(),
      getTrainings: vi.fn(),
      getVoices: vi.fn(),
      ingestTrainingDataForAllEnabledCharacters: vi.fn(),
      ingestTrainingDataForCharacter: vi.fn(),
      invalidateCloudFront: vi.fn(),
      listCampaigns: vi.fn(),
      publishAsset: vi.fn(),
      reviewAsset: vi.fn(),
      startTraining: vi.fn(),
      updateCharacter: vi.fn(),
      uploadDataset: vi.fn(),
    } as unknown as vi.Mocked<AdminFleetService>;

    fleetService = {
      getFleetHealth: vi.fn(),
    } as unknown as vi.Mocked<FleetService>;

    _loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    controller = new AdminFleetController(
      adminFleetService,
      fleetService,
      _loggerService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('requires IP whitelist and platform superadmin guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminFleetController);

    expect(guards).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  describe('Characters', () => {
    describe('listCharacters', () => {
      it('should return all characters', async () => {
        const mockCharacters = [
          { _id: 'char1', name: 'Character 1', slug: 'character-1' },
          { _id: 'char2', name: 'Character 2', slug: 'character-2' },
        ];

        adminFleetService.getCharacters.mockResolvedValue(
          mockCharacters as never,
        );

        const result = await controller.listCharacters(mockRequest, mockUser);

        expect(adminFleetService.getCharacters).toHaveBeenCalledWith('org_123');
        expect(result).toBeDefined();
      });
    });

    describe('getCharacter', () => {
      it('should return character by slug', async () => {
        const mockCharacter = {
          _id: 'char1',
          name: 'Test Character',
          slug: 'test-character',
        };

        adminFleetService.getCharacterBySlug.mockResolvedValue(
          mockCharacter as never,
        );

        const result = await controller.getCharacter(
          mockRequest,
          'test-character',
          mockUser,
        );

        expect(adminFleetService.getCharacterBySlug).toHaveBeenCalledWith(
          'test-character',
          'org_123',
        );
        expect(result).toBeDefined();
      });

      it('should handle character not found', async () => {
        adminFleetService.getCharacterBySlug.mockRejectedValue(
          new NotFoundException('Character'),
        );

        await expect(
          controller.getCharacter(mockRequest, 'nonexistent', mockUser),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('createCharacter', () => {
      it('should create a character successfully', async () => {
        const dto: CreateCharacterDto = {
          description: 'A test character',
          name: 'New Character',
          slug: 'new-character',
        } as CreateCharacterDto;

        const mockCreated = { _id: 'char_new', ...dto };

        adminFleetService.createCharacter.mockResolvedValue(
          mockCreated as never,
        );

        const result = await controller.createCharacter(
          mockRequest,
          dto,
          mockUser,
        );

        expect(adminFleetService.createCharacter).toHaveBeenCalledWith(
          expect.objectContaining({
            brand: expect.anything(),
            description: 'A test character',
            name: 'New Character',
            organization: expect.anything(),
            slug: 'new-character',
            user: expect.anything(),
          }),
        );
        expect(result).toEqual(mockCreated);
      });
    });

    describe('updateCharacter', () => {
      it('should update a character', async () => {
        const dto: UpdateCharacterDto = {
          description: 'Updated description',
        };

        const mockCharacter = {
          _id: 'char1',
          name: 'Test',
          slug: 'test',
        };
        const mockUpdated = { ...mockCharacter, ...dto };

        adminFleetService.getCharacterBySlug.mockResolvedValue(
          mockCharacter as never,
        );
        adminFleetService.updateCharacter.mockResolvedValue(
          mockUpdated as never,
        );

        const result = await controller.updateCharacter(
          mockRequest,
          'test',
          dto,
          mockUser,
        );

        expect(adminFleetService.getCharacterBySlug).toHaveBeenCalledWith(
          'test',
          'org_123',
        );
        expect(adminFleetService.updateCharacter).toHaveBeenCalledWith(
          'char1',
          dto,
        );
        expect(result).toEqual(mockUpdated);
      });
    });

    describe('generateCharacterTrainingData', () => {
      it('should ingest training data for a single character', async () => {
        const mockResult = {
          failed: [],
          failedCount: 0,
          uploadedCount: 6,
        };

        adminFleetService.ingestTrainingDataForCharacter.mockResolvedValue(
          mockResult as never,
        );

        const result = await controller.generateCharacterTrainingData(
          mockRequest,
          'test-character',
          mockUser,
        );

        expect(
          adminFleetService.ingestTrainingDataForCharacter,
        ).toHaveBeenCalledWith('org_123', 'user_123', 'test-character');
        expect(result).toMatchObject({
          _id: 'training-data:test-character',
          ...mockResult,
        });
      });
    });

    describe('deleteCharacter', () => {
      it('should soft-delete a character', async () => {
        const mockCharacter = {
          _id: 'char1',
          name: 'Test',
          slug: 'test',
        };
        const mockDeleted = { ...mockCharacter, isDeleted: true };

        adminFleetService.getCharacterBySlug.mockResolvedValue(
          mockCharacter as never,
        );
        adminFleetService.updateCharacter.mockResolvedValue(
          mockDeleted as never,
        );

        const result = await controller.deleteCharacter(
          mockRequest,
          'test',
          mockUser,
        );

        expect(adminFleetService.updateCharacter).toHaveBeenCalledWith(
          'char1',
          {
            isDeleted: true,
          },
        );
        expect(result).toEqual(mockDeleted);
      });
    });
  });

  describe('Training Data', () => {
    it('should ingest training data for all enabled characters', async () => {
      const mockResult = {
        failed: [],
        failedCount: 0,
        uploadedCount: 12,
      };

      adminFleetService.ingestTrainingDataForAllEnabledCharacters.mockResolvedValue(
        mockResult as never,
      );

      const result = await controller.generateAllTrainingData(
        mockRequest,
        mockUser,
      );

      expect(
        adminFleetService.ingestTrainingDataForAllEnabledCharacters,
      ).toHaveBeenCalledWith('org_123', 'user_123');
      expect(result).toMatchObject({
        _id: 'training-data:org_123',
        ...mockResult,
      });
    });
  });

  describe('Assets', () => {
    describe('listAssets', () => {
      it('should return filtered assets', async () => {
        const query: QueryAssetsDto = {
          limit: 10,
          status: 'pending_review',
        } as QueryAssetsDto;

        const mockAssets = [
          { _id: 'asset1', status: 'pending_review' },
          { _id: 'asset2', status: 'pending_review' },
        ];

        adminFleetService.getAssets.mockResolvedValue(mockAssets as never);

        const result = await controller.listAssets(
          mockRequest,
          query,
          mockUser,
        );

        expect(adminFleetService.getAssets).toHaveBeenCalledWith(
          'org_123',
          query,
        );
        expect(result).toBeDefined();
      });
    });

    describe('reviewAsset', () => {
      it('should approve an asset', async () => {
        const dto: ReviewAssetDto = {
          reviewStatus: 'approved',
        } as ReviewAssetDto;

        const mockReviewed = {
          _id: 'asset1',
          reviewStatus: 'approved',
        };

        adminFleetService.reviewAsset.mockResolvedValue(mockReviewed as never);

        const result = await controller.reviewAsset(
          mockRequest,
          'asset1',
          dto,
          mockUser,
        );

        expect(adminFleetService.reviewAsset).toHaveBeenCalledWith(
          'asset1',
          'org_123',
          'approved',
        );
        expect(result).toEqual(mockReviewed);
      });

      it('should reject an asset', async () => {
        const dto: ReviewAssetDto = {
          reviewStatus: 'rejected',
        } as ReviewAssetDto;

        const mockReviewed = {
          _id: 'asset2',
          reviewStatus: 'rejected',
        };

        adminFleetService.reviewAsset.mockResolvedValue(mockReviewed as never);

        const _result = await controller.reviewAsset(
          mockRequest,
          'asset2',
          dto,
          mockUser,
        );

        expect(adminFleetService.reviewAsset).toHaveBeenCalledWith(
          'asset2',
          'org_123',
          'rejected',
        );
      });
    });

    describe('publishAsset', () => {
      it('should queue asset for publishing', async () => {
        const dto: PublishAssetDto = {
          platforms: ['instagram', 'twitter'],
        } as PublishAssetDto;

        const mockPublishResult = {
          id: 'asset1',
          message: 'Publishing queued',
          organization: 'org_123',
          platforms: ['instagram', 'twitter'],
        };

        adminFleetService.publishAsset.mockResolvedValue(
          mockPublishResult as never,
        );

        const result = await controller.publishAsset('asset1', dto, mockUser);

        expect(adminFleetService.publishAsset).toHaveBeenCalledWith(
          'asset1',
          'org_123',
          'brand_123',
          dto.platforms,
          dto.caption,
        );
        expect(result).toBeDefined();
      });
    });
  });

  describe('Generation', () => {
    describe('generateImage', () => {
      it('should queue image generation', async () => {
        const dto: GenerateImageDto = {
          personaSlug: 'test-persona',
          prompt: 'Generate a beautiful image',
        } as GenerateImageDto;

        const mockIngredient = {
          _id: 'ingredient1',
          category: 'image',
          url: 'https://example.com/image.jpg',
        };

        adminFleetService.generateImage.mockResolvedValue(
          mockIngredient as never,
        );

        const result = await controller.generateImage(
          mockRequest,
          dto,
          mockUser,
        );

        expect(adminFleetService.generateImage).toHaveBeenCalledWith(
          'org_123',
          'brand_123',
          'user_123',
          dto.personaSlug,
          dto.prompt,
          expect.any(Object),
        );
        expect(result).toBeDefined();
      });
    });

    describe('createGenerateJob', () => {
      it('should queue image generation as a durable job', async () => {
        const dto: GenerateImageDto = {
          personaSlug: 'test-persona',
          prompt: 'Generate a beautiful image',
        } as GenerateImageDto;

        const mockJob = {
          createdAt: new Date().toISOString(),
          jobId: 'job_123',
          model: 'flux-dev',
          personaSlug: 'test-persona',
          progress: 5,
          prompt: 'Generate a beautiful image',
          stage: 'queued',
          status: 'queued',
          updatedAt: new Date().toISOString(),
        };

        adminFleetService.createGenerationJob.mockResolvedValue(
          mockJob as never,
        );

        const result = await controller.createGenerateJob(
          mockRequest,
          dto,
          mockUser,
        );

        expect(adminFleetService.createGenerationJob).toHaveBeenCalledWith(
          'org_123',
          'brand_123',
          'user_123',
          dto,
        );
        expect(result).toEqual({
          _id: 'job_123',
          ...mockJob,
        });
      });
    });

    describe('getGenerateJob', () => {
      it('should return a tenant-scoped generation job status', async () => {
        const mockJob = {
          createdAt: new Date().toISOString(),
          jobId: 'job_123',
          model: 'flux-dev',
          personaSlug: 'test-persona',
          progress: 64,
          prompt: 'Generate a beautiful image',
          stage: 'running on ComfyUI',
          status: 'processing',
          updatedAt: new Date().toISOString(),
        };

        adminFleetService.getGenerationJob.mockResolvedValue(mockJob as never);

        const result = await controller.getGenerateJob(
          mockRequest,
          'job_123',
          mockUser,
        );

        expect(adminFleetService.getGenerationJob).toHaveBeenCalledWith(
          'job_123',
          'org_123',
        );
        expect(result).toEqual({
          _id: 'job_123',
          ...mockJob,
        });
      });
    });
  });

  describe('Training', () => {
    describe('listTrainings', () => {
      it('should return all trainings', async () => {
        const mockTrainings = [
          { _id: 'train1', status: 'completed' },
          { _id: 'train2', status: 'running' },
        ];

        adminFleetService.getTrainings.mockResolvedValue(
          mockTrainings as never,
        );

        const result = await controller.listTrainings(
          mockRequest,
          undefined,
          mockUser,
        );

        expect(adminFleetService.getTrainings).toHaveBeenCalledWith(
          'org_123',
          undefined,
        );
        expect(result).toBeDefined();
      });

      it('should filter trainings by persona', async () => {
        const mockTrainings = [{ _id: 'train1', status: 'completed' }];

        adminFleetService.getTrainings.mockResolvedValue(
          mockTrainings as never,
        );

        const _result = await controller.listTrainings(
          mockRequest,
          'test-persona',
          mockUser,
        );

        expect(adminFleetService.getTrainings).toHaveBeenCalledWith(
          'org_123',
          'test-persona',
        );
      });
    });

    describe('getTraining', () => {
      it('should return training details', async () => {
        const mockTraining = {
          _id: 'train1',
          personaSlug: 'test',
          status: 'running',
        };

        adminFleetService.getTraining.mockResolvedValue(mockTraining as never);

        const result = await controller.getTraining(
          mockRequest,
          'train1',
          mockUser,
        );

        expect(adminFleetService.getTraining).toHaveBeenCalledWith(
          'train1',
          'org_123',
        );
        expect(result).toEqual(mockTraining);
      });
    });

    describe('startTraining', () => {
      it('should start training successfully', async () => {
        const dto: StartTrainingDto = {
          baseModel: 'flux-dev',
          personaSlug: 'test-persona',
        } as StartTrainingDto;

        const mockResult = {
          message: 'Training started',
          trainingId: 'train_new',
        };

        adminFleetService.startTraining.mockResolvedValue(mockResult as never);

        const result = await controller.startTraining(
          mockRequest,
          dto,
          mockUser,
        );

        expect(adminFleetService.startTraining).toHaveBeenCalledWith(
          'org_123',
          'user_123',
          'brand_123',
          dto,
        );
        expect(result).toEqual(mockResult);
      });
    });
  });

  describe('Pipeline', () => {
    describe('listCampaigns', () => {
      it('should return campaigns', async () => {
        const mockCampaigns: Array<{
          approvedCount: number;
          assetCount: number;
          campaign: string;
          createdAt: string;
          status: 'active' | 'completed' | 'draft';
        }> = [];
        adminFleetService.listCampaigns.mockResolvedValue(
          mockCampaigns as never,
        );

        const result = await controller.listCampaigns(mockRequest, mockUser);

        expect(adminFleetService.listCampaigns).toHaveBeenCalledWith('org_123');
        expect(result).toBeDefined();
      });
    });

    describe('getPipelineStats', () => {
      it('should return pipeline statistics', async () => {
        const mockStats = {
          assets: { byReviewStatus: {}, byStatus: {}, total: 0 },
          trainings: { byStage: {}, total: 0 },
        };
        adminFleetService.getPipelineStats.mockResolvedValue(
          mockStats as never,
        );

        const result = await controller.getPipelineStats(mockRequest, mockUser);

        expect(adminFleetService.getPipelineStats).toHaveBeenCalledWith(
          'org_123',
        );
        expect(result).toBeDefined();
      });
    });
  });

  describe('Infrastructure', () => {
    describe('getGpuStatus', () => {
      it('should return GPU status from service health', async () => {
        const mockHealth = [
          { name: 'images.genfeed.ai', status: 'online', url: 'https://gpu' },
        ];
        adminFleetService.getServiceHealth.mockResolvedValue(
          mockHealth as never,
        );

        const result = await controller.getGpuStatus(mockRequest);

        expect(adminFleetService.getServiceHealth).toHaveBeenCalled();
        expect(result).toBeDefined();
      });
    });

    describe('getEC2Status', () => {
      it('should return EC2 instance status', async () => {
        const mockStatus = [
          {
            instanceId: 'i-123',
            instanceType: 'g5',
            name: 'gpu-1',
            role: 'images',
            state: 'running',
          },
          {
            instanceId: 'i-456',
            instanceType: 'g5',
            name: 'gpu-2',
            role: 'videos',
            state: 'stopped',
          },
        ];

        adminFleetService.getEC2Status.mockResolvedValue(mockStatus as never);

        const result = await controller.getEC2Status(mockRequest);

        expect(adminFleetService.getEC2Status).toHaveBeenCalled();
        expect(result).toEqual(
          mockStatus.map((instance) => ({
            _id: instance.instanceId,
            ...instance,
          })),
        );
      });
    });

    describe('ec2Action', () => {
      it('should start an EC2 instance', async () => {
        const dto: Ec2ActionDto = {
          action: 'start',
          instanceId: 'i-123',
        };

        const mockResult = {
          instanceId: 'i-123',
          message: 'Instance starting',
        };

        adminFleetService.ec2Action.mockResolvedValue(mockResult as never);

        const result = await controller.ec2Action(mockRequest, dto);

        expect(adminFleetService.ec2Action).toHaveBeenCalledWith(
          'i-123',
          'start',
        );
        expect(result).toEqual({
          _id: 'start:i-123',
          ...mockResult,
        });
      });

      it('should stop an EC2 instance', async () => {
        const dto: Ec2ActionDto = {
          action: 'stop',
          instanceId: 'i-456',
        };

        const mockResult = {
          instanceId: 'i-456',
          message: 'Instance stopping',
        };

        adminFleetService.ec2Action.mockResolvedValue(mockResult as never);

        const _result = await controller.ec2Action(mockRequest, dto);

        expect(adminFleetService.ec2Action).toHaveBeenCalledWith(
          'i-456',
          'stop',
        );
      });
    });

    describe('ec2ActionAll', () => {
      it('should perform a bulk EC2 action', async () => {
        const dto: BulkEc2ActionDto = {
          action: 'start',
        };

        const mockResult = {
          action: 'start',
          results: [
            {
              instanceId: 'i-123',
              name: 'gpu-1',
              state: 'stopped',
              success: true,
            },
          ],
        };

        adminFleetService.ec2ActionAll.mockResolvedValue(mockResult as never);

        const result = await controller.ec2ActionAll(mockRequest, dto);

        expect(adminFleetService.ec2ActionAll).toHaveBeenCalledWith(
          'start',
          undefined,
        );
        expect(result).toEqual({
          _id: 'ec2-action-all:start:all',
          ...mockResult,
        });
      });
    });

    describe('invalidateCloudFront', () => {
      it('should invalidate CloudFront cache', async () => {
        const dto: CloudFrontInvalidateDto = {
          distributionId: 'E123ABC',
          paths: ['/images/*', '/assets/*'],
        };

        const mockResult = {
          invalidationId: 'I123',
          message: 'Invalidation created',
        };

        adminFleetService.invalidateCloudFront.mockResolvedValue(
          mockResult as never,
        );

        const result = await controller.invalidateCloudFront(mockRequest, dto);

        expect(adminFleetService.invalidateCloudFront).toHaveBeenCalledWith(
          'E123ABC',
          ['/images/*', '/assets/*'],
        );
        expect(result).toEqual({
          _id: 'I123',
          ...mockResult,
        });
      });
    });

    describe('getServiceHealth', () => {
      it('should return service health status', async () => {
        const mockHealth = [
          { name: 'images.genfeed.ai', status: 'online', url: 'https://gpu' },
        ];

        adminFleetService.getServiceHealth.mockResolvedValue(
          mockHealth as never,
        );

        const result = await controller.getServiceHealth(mockRequest);

        expect(adminFleetService.getServiceHealth).toHaveBeenCalled();
        expect(result).toEqual(
          mockHealth.map((service) => ({
            _id: service.name,
            ...service,
          })),
        );
      });
    });

    describe('getFleetHealth', () => {
      it('should return GPU fleet health', async () => {
        const mockFleetHealth = {
          instances: [
            {
              lastChecked: new Date().toISOString(),
              name: 'gpu-1',
              role: 'images',
              status: 'online',
              url: 'https://gpu-1',
            },
            {
              lastChecked: new Date().toISOString(),
              name: 'gpu-2',
              role: 'videos',
              status: 'offline',
              url: 'https://gpu-2',
            },
          ],
          timestamp: new Date().toISOString(),
        };

        fleetService.getFleetHealth.mockResolvedValue(mockFleetHealth as never);

        const result = await controller.getFleetHealth(mockRequest);

        expect(fleetService.getFleetHealth).toHaveBeenCalled();
        expect(result).toEqual({
          _id: `fleet-health:${mockFleetHealth.timestamp}`,
          ...mockFleetHealth,
        });
      });
    });
  });
});
