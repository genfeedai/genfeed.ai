vi.mock('@aws-sdk/client-ec2', () => ({
  DescribeInstancesCommand: vi.fn(),
  EC2Client: vi.fn().mockImplementation(function () {
    return { send: vi.fn() };
  }),
  StartInstancesCommand: vi.fn(),
  StopInstancesCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn() };
  }),
  CreateInvalidationCommand: vi.fn(),
}));

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreatorScraperService } from '@api/collections/content-intelligence/services/creator-scraper.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { DarkroomService } from '@api/endpoints/admin/darkroom/darkroom.service';
import { DarkroomTrainingService } from '@api/endpoints/admin/darkroom/services/darkroom-training.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { DarkroomReviewStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const makePersona = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => 'persona-1' },
  brand: { toString: () => 'brand-1' },
  isDarkroomCharacter: true,
  isDeleted: false,
  slug: 'alice',
  triggerWord: 'alice_lora',
  ...overrides,
});

const makeIngredient = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => 'ingredient-1' },
  category: 'image',
  cdnUrl: 'https://cdn.example.com/img.jpg',
  isDeleted: false,
  reviewStatus: DarkroomReviewStatus.PENDING,
  ...overrides,
});

describe('DarkroomService', () => {
  let service: DarkroomService;
  let personasService: Record<string, ReturnType<typeof vi.fn>>;
  let ingredientsService: Record<string, ReturnType<typeof vi.fn>>;
  let trainingsService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: Record<string, ReturnType<typeof vi.fn>>;
  let fleetService: Record<string, ReturnType<typeof vi.fn>>;
  let elevenLabsService: Record<string, ReturnType<typeof vi.fn>>;
  let heyGenService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    personasService = {
      create: vi.fn().mockResolvedValue(makePersona()),
      findAllByOrganization: vi.fn().mockResolvedValue([makePersona()]),
      findOne: vi.fn().mockResolvedValue(makePersona()),
      patch: vi.fn().mockResolvedValue(makePersona()),
    };
    ingredientsService = {
      create: vi.fn().mockResolvedValue(makeIngredient()),
      findAllByOrganization: vi.fn().mockResolvedValue([makeIngredient()]),
      findOne: vi.fn().mockResolvedValue(makeIngredient()),
      model: { aggregate: vi.fn().mockResolvedValue([{}]) },
      patch: vi.fn().mockResolvedValue(makeIngredient()),
    };
    trainingsService = {
      create: vi
        .fn()
        .mockResolvedValue({ _id: { toString: () => 'training-1' } }),
      findAllByOrganization: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ _id: 'training-1' }),
      model: { aggregate: vi.fn().mockResolvedValue([{}]) },
    };
    configService = {
      get: vi.fn((key: string) => {
        const cfg: Record<string, string> = {
          AWS_ACCESS_KEY_ID: 'test-key',
          AWS_REGION: 'us-east-1',
          AWS_SECRET_ACCESS_KEY: 'test-secret',
          DARKROOM_CLOUDFRONT_DISTRIBUTION_ID: 'dist-123',
          GPU_IMAGES_URL: 'http://images.local',
        };
        return cfg[key] ?? '';
      }),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    fleetService = {
      generateVoice: vi.fn().mockResolvedValue(null),
      getVoiceProfiles: vi.fn().mockResolvedValue([]),
      pollJob: vi.fn().mockResolvedValue(null),
    };
    elevenLabsService = {
      generateAndUploadAudio: vi
        .fn()
        .mockResolvedValue({ audioUrl: 'https://audio.example.com/tts.mp3' }),
      getVoices: vi
        .fn()
        .mockResolvedValue([{ name: 'Alice', voiceId: 'voice-1' }]),
    };
    heyGenService = {
      generatePhotoAvatarVideo: vi.fn().mockResolvedValue('heygen-job-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DarkroomService,
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({ isDarkroomEnabled: true }),
          },
        },
        { provide: PersonasService, useValue: personasService },
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: TrainingsService, useValue: trainingsService },
        {
          provide: DarkroomTrainingService,
          useValue: {
            autoTuneHyperparameters: vi
              .fn()
              .mockReturnValue({ learningRate: 0.0001, rank: 16, steps: 1000 }),
            executeTrainingPipeline: vi.fn().mockResolvedValue(undefined),
            getDatasetInfo: vi.fn().mockResolvedValue({ imageCount: 10 }),
            syncDataset: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: ComfyUIService, useValue: { generateImage: vi.fn() } },
        { provide: InstagramService, useValue: { uploadImage: vi.fn() } },
        { provide: TwitterService, useValue: { uploadMedia: vi.fn() } },
        { provide: FacebookService, useValue: { uploadImage: vi.fn() } },
        { provide: CredentialsService, useValue: { findOne: vi.fn() } },
        {
          provide: FilesClientService,
          useValue: {
            uploadToS3: vi.fn().mockResolvedValue({
              publicUrl: 'https://cdn.example.com/file.jpg',
              s3Key: 'file.jpg',
            }),
          },
        },
        {
          provide: CreatorScraperService,
          useValue: { scrapeByPlatform: vi.fn() },
        },
        { provide: FleetService, useValue: fleetService },
        { provide: HeyGenService, useValue: heyGenService },
        { provide: ElevenLabsService, useValue: elevenLabsService },
      ],
    }).compile();

    service = module.get<DarkroomService>(DarkroomService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getCharacters ────────────────────────────────────────────────────────

  describe('getCharacters', () => {
    it('delegates to personasService with isDarkroomCharacter filter', async () => {
      await service.getCharacters('org-1');
      expect(personasService.findAllByOrganization).toHaveBeenCalledWith(
        'org-1',
        { isDarkroomCharacter: true },
      );
    });
  });

  // ─── getCharacterBySlug ───────────────────────────────────────────────────

  describe('getCharacterBySlug', () => {
    it('returns persona when found', async () => {
      const result = await service.getCharacterBySlug('alice', 'org-1');
      expect(result).toHaveProperty('slug', 'alice');
    });

    it('throws NotFoundException when persona not found', async () => {
      personasService.findOne.mockResolvedValue(null);
      await expect(
        service.getCharacterBySlug('ghost', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createCharacter ──────────────────────────────────────────────────────

  describe('createCharacter', () => {
    it('creates persona with isDarkroomCharacter: true', async () => {
      await service.createCharacter({
        brand: 'brand-1' as never,
        organization: 'org-1' as never,
        slug: 'bob',
        user: 'user-1' as never,
      });
      expect(personasService.create).toHaveBeenCalledWith(
        expect.objectContaining({ isDarkroomCharacter: true }),
      );
    });
  });

  // ─── reviewAsset ─────────────────────────────────────────────────────────

  describe('reviewAsset', () => {
    it('throws NotFoundException when ingredient not found for org', async () => {
      ingredientsService.findOne.mockResolvedValue(null);
      await expect(
        service.reviewAsset('ing-1', 'org-1', DarkroomReviewStatus.APPROVED),
      ).rejects.toThrow(NotFoundException);
    });

    it('patches ingredient with new reviewStatus', async () => {
      ingredientsService.findOne.mockResolvedValue(makeIngredient());
      ingredientsService.patch.mockResolvedValue(
        makeIngredient({ reviewStatus: DarkroomReviewStatus.APPROVED }),
      );
      const result = await service.reviewAsset(
        'ing-1',
        'org-1',
        DarkroomReviewStatus.APPROVED,
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        'ing-1',
        expect.objectContaining({
          reviewStatus: DarkroomReviewStatus.APPROVED,
        }),
      );
    });
  });

  // ─── getTrainings ─────────────────────────────────────────────────────────

  describe('getTrainings', () => {
    it('gets trainings for organization', async () => {
      await service.getTrainings('org-1');
      expect(trainingsService.findAllByOrganization).toHaveBeenCalledWith(
        'org-1',
        {},
      );
    });

    it('filters by personaSlug when provided', async () => {
      await service.getTrainings('org-1', 'alice');
      expect(trainingsService.findAllByOrganization).toHaveBeenCalledWith(
        'org-1',
        { personaSlug: 'alice' },
      );
    });
  });

  // ─── getTraining ─────────────────────────────────────────────────────────

  describe('getTraining', () => {
    it('throws NotFoundException when training not found', async () => {
      trainingsService.findOne.mockResolvedValue(null);
      await expect(service.getTraining('t-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns training when found', async () => {
      const result = await service.getTraining('t-1', 'org-1');
      expect(result).toBeDefined();
    });
  });

  // ─── getDefaultCloudFrontDistributionId ───────────────────────────────────

  describe('getDefaultCloudFrontDistributionId', () => {
    it('returns configured distribution ID', () => {
      const result = service.getDefaultCloudFrontDistributionId();
      expect(result).toBe('dist-123');
    });

    it('returns empty string when not configured', () => {
      configService.get.mockReturnValue('');
      const result = service.getDefaultCloudFrontDistributionId();
      expect(result).toBe('');
    });
  });

  // ─── getVoices ────────────────────────────────────────────────────────────

  describe('getVoices', () => {
    it('falls back to ElevenLabs when fleet has no voices', async () => {
      fleetService.getVoiceProfiles.mockResolvedValue([]);
      const voices = await service.getVoices();
      expect(elevenLabsService.getVoices).toHaveBeenCalled();
      expect(voices).toEqual([{ name: 'Alice', voiceId: 'voice-1' }]);
    });

    it('uses fleet voices when available', async () => {
      fleetService.getVoiceProfiles.mockResolvedValue([
        {
          handle: 'fleet-voice-1',
          label: 'Fleet Alice',
          sampleUrl: 'https://sample.mp3',
        },
      ]);
      const voices = await service.getVoices();
      expect(elevenLabsService.getVoices).not.toHaveBeenCalled();
      expect(voices[0].voiceId).toBe('fleet-voice-1');
    });
  });

  // ─── invalidateCloudFront ────────────────────────────────────────────────

  describe('invalidateCloudFront', () => {
    it('throws BadRequestException when distributionId is empty', async () => {
      await expect(service.invalidateCloudFront('')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── generateLipSync ─────────────────────────────────────────────────────

  describe('generateLipSync', () => {
    it('throws NotFoundException when character not found', async () => {
      personasService.findOne.mockResolvedValue(null);
      await expect(
        service.generateLipSync('org-1', {
          audioUrl: 'https://audio.mp3',
          imageUrl: 'https://img.jpg',
          personaSlug: 'ghost',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no audio and no voice', async () => {
      personasService.findOne.mockResolvedValue(
        makePersona({ voiceId: undefined }),
      );
      await expect(
        service.generateLipSync('org-1', {
          imageUrl: 'https://img.jpg',
          personaSlug: 'alice',
          text: 'Say this',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls heyGenService with audioUrl when provided', async () => {
      personasService.findOne.mockResolvedValue(makePersona());
      await service.generateLipSync('org-1', {
        audioUrl: 'https://audio.mp3',
        imageUrl: 'https://img.jpg',
        personaSlug: 'alice',
      });
      expect(heyGenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
        expect.stringContaining('alice'),
        'https://img.jpg',
        'https://audio.mp3',
      );
    });

    it('returns jobId and processing status', async () => {
      personasService.findOne.mockResolvedValue(makePersona());
      const result = await service.generateLipSync('org-1', {
        audioUrl: 'https://audio.mp3',
        imageUrl: 'https://img.jpg',
        personaSlug: 'alice',
      });
      expect(result.jobId).toBe('heygen-job-1');
      expect(result.status).toBe('processing');
    });
  });
});
