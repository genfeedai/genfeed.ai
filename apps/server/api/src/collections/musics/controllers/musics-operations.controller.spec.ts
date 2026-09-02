import { readFileSync } from 'node:fs';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MusicsOperationsController } from '@api/collections/musics/controllers/musics-operations.controller';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { ActivitySource, ModelCategory } from '@genfeedai/enums';
import type {
  CreditsConfig,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

describe('MusicsOperationsController', () => {
  let controller: MusicsOperationsController;
  const musicGenerationService = {
    generateMusic: vi.fn(),
  };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
  };

  const user = {
    brandId: 'brand-1',
    id: 'auth-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;
  const dto = Object.assign(new CreateMusicDto(), {
    duration: 10,
    outputs: 1,
    text: 'Generate happy background music',
  });
  const request = { originalUrl: '/api/musics' } as unknown as Request;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new MusicsOperationsController(
      loggerService as unknown as LoggerService,
      musicGenerationService as unknown as MusicGenerationService,
    );
  });

  it('delegates the unchanged request contract to MusicGenerationService', async () => {
    const response = {
      data: { id: 'music-1' },
    } as unknown as JsonApiSingleResponse;
    musicGenerationService.generateMusic.mockResolvedValue(response);

    await expect(controller.create(request, user, dto)).resolves.toBe(response);
    expect(musicGenerationService.generateMusic).toHaveBeenCalledOnce();
    expect(musicGenerationService.generateMusic).toHaveBeenCalledWith(
      user,
      dto,
      request,
    );
    expect(loggerService.log).toHaveBeenCalledWith(
      'MusicsOperationsController.create started',
      {
        operation: 'create',
        service: 'MusicsOperationsController',
      },
    );
  });

  it('passes delegated HTTP errors through unchanged', async () => {
    const error = new HttpException(
      { detail: 'Prompt is required', title: 'Prompt validation failed' },
      HttpStatus.BAD_REQUEST,
    );
    musicGenerationService.generateMusic.mockRejectedValue(error);

    await expect(controller.create(request, user, dto)).rejects.toBe(error);
    expect(loggerService.error).toHaveBeenCalledWith(
      'MusicsOperationsController.create failed',
      expect.objectContaining({
        operation: 'create',
        service: 'MusicsOperationsController',
      }),
    );
  });

  it('preserves POST /musics and its OpenAPI identity', () => {
    const handler = MusicsOperationsController.prototype.create;

    expect(Reflect.getMetadata(PATH_METADATA, MusicsOperationsController)).toBe(
      'musics',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      summary: 'create',
    });
  });

  it('preserves controller and endpoint guards', () => {
    const handler = MusicsOperationsController.prototype.create;

    expect(
      Reflect.getMetadata(GUARDS_METADATA, MusicsOperationsController),
    ).toEqual([RolesGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      SubscriptionGuard,
      CreditsGuard,
      ModelsGuard,
    ]);
  });

  it('preserves credit and model-validation metadata', () => {
    const handler = MusicsOperationsController.prototype.create;
    const reflector = new Reflector();

    expect(Reflect.getMetadata(CREDITS_KEY, handler) as CreditsConfig).toEqual({
      description: 'Music generation',
      source: ActivitySource.MUSIC_GENERATION,
    });
    expect(reflector.get(ValidateModel, handler)).toEqual({
      category: ModelCategory.MUSIC,
    });
  });

  it('keeps CreateMusicDto as the runtime request body type', () => {
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      MusicsOperationsController.prototype,
      'create',
    ) as unknown[];

    expect(parameterTypes[2]).toBe(CreateMusicDto);
  });

  it('keeps the controller transport-only and within the controller limit', () => {
    const source = readFileSync(
      new URL('./musics-operations.controller.ts', import.meta.url),
      'utf8',
    );

    expect(source.trimEnd().split('\n').length).toBeLessThanOrEqual(500);
    expect(source).not.toMatch(
      /ReplicateService|CreditsUtilsService|createMediaDocuments|waitForMultipleIngredientsCompletion|serializeSingle/,
    );
  });
});
