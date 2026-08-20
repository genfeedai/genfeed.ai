import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';

describe('folder id alias transform', () => {
  it('maps the client `folder` query key onto `folderId`', () => {
    const dto = plainToInstance(
      IngredientsQueryDto,
      { folder: 'folder-1' },
      { enableImplicitConversion: false, exposeDefaultValues: true },
    );

    expect(dto.folderId).toBe('folder-1');
  });

  it('prefers an explicit `folderId` over the alias', () => {
    const dto = plainToInstance(
      IngredientsQueryDto,
      { folder: 'folder-1', folderId: 'folder-2' },
      { enableImplicitConversion: false, exposeDefaultValues: true },
    );

    expect(dto.folderId).toBe('folder-2');
  });

  it('leaves `folderId` unset when neither key is present', () => {
    const dto = plainToInstance(
      IngredientsQueryDto,
      {},
      { enableImplicitConversion: false, exposeDefaultValues: true },
    );

    expect(dto.folderId).toBeUndefined();
  });

  it('ignores an empty alias', () => {
    const dto = plainToInstance(
      IngredientsQueryDto,
      { folder: '' },
      { enableImplicitConversion: false, exposeDefaultValues: true },
    );

    expect(dto.folderId).toBeUndefined();
  });

  it('applies to the type-seeded list DTOs too', () => {
    const dto = plainToInstance(
      VideosQueryDto,
      { folder: 'folder-3' },
      { enableImplicitConversion: false, exposeDefaultValues: true },
    );

    expect(dto.folderId).toBe('folder-3');
  });
});
