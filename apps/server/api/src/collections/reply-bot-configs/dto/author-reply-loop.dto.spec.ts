import { AuthorReplyInboxQueryDto } from '@api/collections/reply-bot-configs/dto/author-reply-loop.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('AuthorReplyInboxQueryDto', () => {
  it('converts the HTTP hours query parameter before number validation', async () => {
    const dto = plainToInstance(AuthorReplyInboxQueryDto, {
      brandId: 'cmptu23gf0003zixna6ntvv6k',
      hours: '24',
      platform: 'twitter',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.hours).toBe(24);
  });
});
