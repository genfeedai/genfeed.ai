import { PersonasService } from '@api/collections/personas/services/personas.service';
import { DarkroomCharacterService } from '@api/endpoints/admin/darkroom/services/darkroom-character.service';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DarkroomCharacterService', () => {
  let service: DarkroomCharacterService;
  let personasService: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: Record<string, ReturnType<typeof vi.fn>>;

  const persona = { _id: { toString: () => 'persona-1' }, slug: 'alice' };

  beforeEach(async () => {
    personasService = {
      create: vi.fn().mockResolvedValue(persona),
      findAllByOrganization: vi.fn().mockResolvedValue([persona]),
      findOne: vi.fn().mockResolvedValue(persona),
      patch: vi.fn().mockResolvedValue(persona),
    };

    loggerService = {
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DarkroomCharacterService,
        { provide: PersonasService, useValue: personasService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<DarkroomCharacterService>(DarkroomCharacterService);
  });

  describe('findPersonaBySlug', () => {
    it('queries the canonical darkroom-character scope', async () => {
      await service.findPersonaBySlug('alice', 'org-123');

      expect(personasService.findOne).toHaveBeenCalledWith({
        isDarkroomCharacter: true,
        isDeleted: false,
        organization: 'org-123',
        slug: 'alice',
      });
    });

    it('returns null when the persona is absent', async () => {
      personasService.findOne.mockResolvedValue(null);

      await expect(service.findPersonaBySlug('ghost', 'org-123')).resolves.toBe(
        null,
      );
    });
  });

  describe('requirePersonaBySlug', () => {
    it('returns the persona when present', async () => {
      await expect(
        service.requirePersonaBySlug('alice', 'org-123'),
      ).resolves.toBe(persona);
    });

    it('throws NotFoundException with the default message when absent', async () => {
      personasService.findOne.mockResolvedValue(null);

      await expect(
        service.requirePersonaBySlug('ghost', 'org-123'),
      ).rejects.toThrow(new NotFoundException('Character "ghost" not found'));
    });

    it('throws NotFoundException with a custom message when provided', async () => {
      personasService.findOne.mockResolvedValue(null);

      await expect(
        service.requirePersonaBySlug('ghost', 'org-123', 'custom message'),
      ).rejects.toThrow(new NotFoundException('custom message'));
    });
  });

  describe('getCharacterBySlug', () => {
    it('preserves the slug-specific not-found message', async () => {
      personasService.findOne.mockResolvedValue(null);

      await expect(
        service.getCharacterBySlug('ghost', 'org-123'),
      ).rejects.toThrow(
        new NotFoundException('Character with slug "ghost" not found'),
      );
    });
  });

  describe('getCharacters', () => {
    it('lists darkroom characters for the organization', async () => {
      await service.getCharacters('org-123');

      expect(personasService.findAllByOrganization).toHaveBeenCalledWith(
        'org-123',
        { isDarkroomCharacter: true },
      );
    });
  });

  describe('createCharacter', () => {
    it('forces the isDarkroomCharacter flag', async () => {
      await service.createCharacter({
        brand: 'brand-1',
        organization: 'org-123',
        slug: 'alice',
        user: 'user-1',
      });

      expect(personasService.create).toHaveBeenCalledWith(
        expect.objectContaining({ isDarkroomCharacter: true, slug: 'alice' }),
      );
    });
  });
});
