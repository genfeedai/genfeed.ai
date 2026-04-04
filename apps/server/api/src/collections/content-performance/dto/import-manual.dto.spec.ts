import { ImportManualDto } from '@api/collections/content-performance/dto/import-manual.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('ImportManualDto', () => {
  it('should validate with postId', async () => {
    const dto = plainToInstance(ImportManualDto, {
      likes: 25,
      platform: 'instagram',
      postId: '507f1f77bcf86cd799439011',
      views: 500,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate with externalPostId', async () => {
    const dto = plainToInstance(ImportManualDto, {
      comments: 50,
      externalPostId: 'ext-123',
      likes: 500,
      platform: 'tiktok',
      views: 10000,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should require platform', async () => {
    const dto = plainToInstance(ImportManualDto, {
      postId: '507f1f77bcf86cd799439011',
      views: 100,
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'platform')).toBe(true);
  });

  it('should reject negative metric values', async () => {
    const dto = plainToInstance(ImportManualDto, {
      platform: 'instagram',
      postId: '507f1f77bcf86cd799439011',
      views: -100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept notes field', async () => {
    const dto = plainToInstance(ImportManualDto, {
      notes: 'Extracted from screenshot',
      platform: 'instagram',
      postId: '507f1f77bcf86cd799439011',
      views: 100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
