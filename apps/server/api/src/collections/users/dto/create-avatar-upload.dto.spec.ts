import { CreateAvatarUploadDto } from '@api/collections/users/dto/create-avatar-upload.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('CreateAvatarUploadDto', () => {
  it('accepts a MIME type', async () => {
    expect(
      await validate(
        plainToInstance(CreateAvatarUploadDto, { contentType: 'image/png' }),
      ),
    ).toHaveLength(0);
  });

  it.each([undefined, null, 123, {}])(
    'rejects a missing or non-string MIME type %s',
    async (contentType) => {
      expect(
        await validate(plainToInstance(CreateAvatarUploadDto, { contentType })),
      ).not.toHaveLength(0);
    },
  );
});
