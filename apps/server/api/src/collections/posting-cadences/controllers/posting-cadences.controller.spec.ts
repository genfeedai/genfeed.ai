import { PostingCadencesController } from '@api/collections/posting-cadences/controllers/posting-cadences.controller';
import { PostingCadencesService } from '@api/collections/posting-cadences/services/posting-cadences.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

const MUTATION_SCOPES = [
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.POSTS_SCHEDULE,
];

describe('PostingCadencesController', () => {
  it('declares fail-closed publishing scopes on mutation routes', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostingCadencesController],
      providers: [
        {
          provide: PostingCadencesService,
          useValue: {
            book: vi.fn(),
            create: vi.fn(),
            generate: vi.fn(),
            generateBulk: vi.fn(),
            list: vi.fn(),
            listSlots: vi.fn(),
            write: vi.fn(),
          },
        },
      ],
    }).compile();

    expect(module.get(PostingCadencesController)).toBeDefined();
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.create,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.book,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.generate,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.write,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.generateBulk,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.skip,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.cancel,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.update,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.remove,
      ),
    ).toEqual(MUTATION_SCOPES);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostingCadencesController.prototype.list,
      ),
    ).toBeUndefined();
  });
});
