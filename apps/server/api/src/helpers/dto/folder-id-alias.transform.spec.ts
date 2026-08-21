import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { describe, expect, it } from 'vitest';

describe('folder id alias transform', () => {
  const pipe = new ValidationPipe();

  const transformQuery = async (
    metatype: unknown,
    source: Record<string, unknown>,
  ): Promise<Record<string, unknown>> =>
    (await pipe.transform(source, {
      metatype: metatype as never,
      type: 'query',
      data: undefined,
    })) as Record<string, unknown>;

  it('maps the client `folder` query key onto `folderId`', async () => {
    const dto = await transformQuery(IngredientsQueryDto, {
      folder: '5b0f3013-8c5d-4a1e-9c2f-0d3a7b8e1f10',
    });

    expect(dto.folderId).toBe('5b0f3013-8c5d-4a1e-9c2f-0d3a7b8e1f10');
  });

  it('prefers an explicit `folderId` over the alias', async () => {
    const dto = await transformQuery(IngredientsQueryDto, {
      folder: '5b0f3013-8c5d-4a1e-9c2f-0d3a7b8e1f10',
      folderId: '6c1f4024-9d6e-4b2f-8d3a-1e4b8c9f2a21',
    });

    expect(dto.folderId).toBe('6c1f4024-9d6e-4b2f-8d3a-1e4b8c9f2a21');
  });

  it('leaves `folderId` unset when neither key is present', async () => {
    const dto = await transformQuery(IngredientsQueryDto, {});

    expect(dto.folderId).toBeUndefined();
  });

  it('ignores an empty alias', async () => {
    const dto = await transformQuery(IngredientsQueryDto, { folder: '' });

    expect(dto.folderId).toBeUndefined();
  });

  it('applies to the type-seeded list DTOs too', async () => {
    const dto = await transformQuery(VideosQueryDto, {
      folder: '7d2a5135-ae7f-4c3a-9e4b-2f5c9d0a3b32',
    });

    expect(dto.folderId).toBe('7d2a5135-ae7f-4c3a-9e4b-2f5c9d0a3b32');
  });
});
