import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type {
  GeneratePhotoInput,
  GenerateVideoInput,
  GenerateVoiceInput,
} from '@api/services/persona-content/persona-content.service';
import { PersonaContentService } from '@api/services/persona-content/persona-content.service';
import { AvatarProvider, VoiceProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const objectId = () => new Types.ObjectId();

const makePersona = (
  overrides: Partial<PersonaDocument> = {},
): PersonaDocument =>
  ({
    _id: objectId(),
    avatarExternalId: 'avatar-ext-id',
    avatarProvider: AvatarProvider.HEYGEN,
    label: 'TestPersona',
    voiceExternalId: 'voice-ext-id',
    voiceProvider: VoiceProvider.ELEVENLABS,
    ...overrides,
  }) as unknown as PersonaDocument;

const baseInput = () => ({
  organization: objectId(),
  personaId: objectId(),
  user: objectId(),
});

describe('PersonaContentService', () => {
  let service: PersonaContentService;
  const mockPersonasService = { findOne: vi.fn() };
  const mockHeyGenService = {
    generateAvatarVideo: vi.fn().mockResolvedValue('heygen-job-id'),
    generatePhotoAvatarVideo: vi.fn().mockResolvedValue('heygen-url'),
  };
  const mockHedraService = {
    generateCharacterWithText: vi.fn().mockResolvedValue('hedra-job-id'),
  };
  const mockElevenLabsService = {
    generateAndUploadAudio: vi
      .fn()
      .mockResolvedValue({ audioUrl: 'https://cdn.example.com/audio.mp3' }),
  };
  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonaContentService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: PersonasService, useValue: mockPersonasService },
        { provide: HeyGenService, useValue: mockHeyGenService },
        { provide: HedraService, useValue: mockHedraService },
        { provide: ElevenLabsService, useValue: mockElevenLabsService },
      ],
    }).compile();

    service = module.get<PersonaContentService>(PersonaContentService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException when persona not found for photo generation', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(null);
    const input: GeneratePhotoInput = { ...baseInput(), prompt: 'hi' };
    await expect(service.generatePhoto(input)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should use HeyGen by default for photo generation', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(makePersona());
    const input: GeneratePhotoInput = { ...baseInput(), prompt: 'portrait' };

    const result = await service.generatePhoto(input);
    expect(result.provider).toBe(AvatarProvider.HEYGEN);
    expect(result.status).toBe('queued');
    expect(mockHeyGenService.generatePhotoAvatarVideo).toHaveBeenCalled();
  });

  it('should use Hedra when persona has HEDRA avatar provider', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(
      makePersona({ avatarProvider: AvatarProvider.HEDRA }),
    );
    const input: GeneratePhotoInput = { ...baseInput() };

    const result = await service.generatePhoto(input);
    expect(result.provider).toBe(AvatarProvider.HEDRA);
    expect(result.status).toBe('queued');
    expect(result.jobId).toBe('hedra-job-id');
  });

  it('should return failed status when photo generation throws', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(makePersona());
    mockHeyGenService.generatePhotoAvatarVideo.mockRejectedValueOnce(
      new Error('API error'),
    );
    const input: GeneratePhotoInput = { ...baseInput() };

    const result = await service.generatePhoto(input);
    expect(result.status).toBe('failed');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should generate video via HeyGen by default', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(makePersona());
    const input: GenerateVideoInput = { ...baseInput(), script: 'Hello world' };

    const result = await service.generateVideo(input);
    expect(result.provider).toBe(AvatarProvider.HEYGEN);
    expect(result.jobId).toBe('heygen-job-id');
    expect(result.status).toBe('queued');
  });

  it('should generate video via Hedra when configured', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(
      makePersona({ avatarProvider: AvatarProvider.HEDRA }),
    );
    const input: GenerateVideoInput = {
      ...baseInput(),
      aspectRatio: '9:16',
      script: 'test script',
    };

    const result = await service.generateVideo(input);
    expect(result.provider).toBe(AvatarProvider.HEDRA);
    expect(mockHedraService.generateCharacterWithText).toHaveBeenCalled();
  });

  it('should return failed status when video generation throws', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(makePersona());
    mockHeyGenService.generateAvatarVideo.mockRejectedValueOnce(
      new Error('timeout'),
    );
    const input: GenerateVideoInput = { ...baseInput(), script: 'test' };

    const result = await service.generateVideo(input);
    expect(result.status).toBe('failed');
  });

  it('should generate voice via ElevenLabs when configured', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(makePersona());
    const input: GenerateVoiceInput = { ...baseInput(), text: 'hello' };

    const result = await service.generateVoice(input);
    expect(result.provider).toBe(VoiceProvider.ELEVENLABS);
    expect(result.status).toBe('completed');
    expect(result.url).toBe('https://cdn.example.com/audio.mp3');
  });

  it('should generate voice via HeyGen when configured as voice provider', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(
      makePersona({ voiceProvider: VoiceProvider.HEYGEN }),
    );
    const input: GenerateVoiceInput = { ...baseInput(), text: 'hi there' };

    const result = await service.generateVoice(input);
    expect(result.provider).toBe(VoiceProvider.HEYGEN);
    expect(result.status).toBe('queued');
  });

  it('should return failed when no voice provider is configured', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(
      makePersona({
        voiceExternalId: undefined,
        voiceProvider: undefined,
      } as Partial<PersonaDocument>),
    );
    const input: GenerateVoiceInput = { ...baseInput(), text: 'hi' };

    const result = await service.generateVoice(input);
    expect(result.status).toBe('failed');
  });
});
