import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { DarkroomCharacterService } from '@api/endpoints/admin/darkroom/services/darkroom-character.service';
import { DarkroomTrainingService } from '@api/endpoints/admin/darkroom/services/darkroom-training.service';
import { DarkroomTrainingOrchestratorService } from '@api/endpoints/admin/darkroom/services/darkroom-training-orchestrator.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DarkroomTrainingOrchestratorService', () => {
  let service: DarkroomTrainingOrchestratorService;
  let characterService: Record<string, ReturnType<typeof vi.fn>>;
  let trainingsService: Record<string, ReturnType<typeof vi.fn>>;
  let darkroomTrainingService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    characterService = {
      requirePersonaBySlug: vi
        .fn()
        .mockResolvedValue({ _id: { toString: () => 'persona-1' } }),
    };
    trainingsService = { create: vi.fn(), findOne: vi.fn() };
    darkroomTrainingService = {
      autoTuneHyperparameters: vi.fn(),
      getDatasetInfo: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DarkroomTrainingOrchestratorService,
        { provide: DarkroomCharacterService, useValue: characterService },
        {
          provide: IngredientsService,
          useValue: { findAllByOrganization: vi.fn() },
        },
        { provide: TrainingsService, useValue: trainingsService },
        { provide: PersonasService, useValue: { patch: vi.fn() } },
        {
          provide: DarkroomTrainingService,
          useValue: darkroomTrainingService,
        },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
      ],
    }).compile();

    service = module.get(DarkroomTrainingOrchestratorService);
  });

  it('throws NotFound when the training does not exist', async () => {
    trainingsService.findOne.mockResolvedValue(null);

    await expect(service.getTraining('t-1', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses to start training on an empty dataset and does not create a record', async () => {
    darkroomTrainingService.getDatasetInfo.mockResolvedValue({ imageCount: 0 });

    await expect(
      service.startTraining('org-1', 'user-1', {
        label: 'My LoRA',
        personaSlug: 'alice',
        sourceIds: ['507f1f77bcf86cd799439011'],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(trainingsService.create).not.toHaveBeenCalled();
  });
});
