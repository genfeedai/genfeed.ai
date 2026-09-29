import { ImportManualDto } from '@api/collections/content-performance/dto/import-manual.dto';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const postId = testId('post');

describe('ImportManualDto', () => {
  it('should accept notes field', async () => {
    const dto = plainToInstance(ImportManualDto, {
      notes: 'Extracted from screenshot',
      platform: 'instagram',
      postId,
      views: 100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
