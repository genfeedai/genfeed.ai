import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function externalUrlErrorsFor(externalUrl: unknown) {
  const errors = await validate(
    plainToInstance(UpdateArticleDto, { externalUrl }),
  );
  return errors.filter((error) => error.property === 'externalUrl');
}

describe('UpdateArticleDto', () => {
  it('should be defined', () => {
    expect(UpdateArticleDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateArticleDto();
      expect(dto).toBeInstanceOf(UpdateArticleDto);
    });

    it('accepts an http(s) external URL and null to clear it', async () => {
      await expect(
        externalUrlErrorsFor('https://blog.example.com/posts/launch'),
      ).resolves.toEqual([]);
      await expect(externalUrlErrorsFor(null)).resolves.toEqual([]);
    });

    it('rejects a non-URL or non-web external URL', async () => {
      await expect(externalUrlErrorsFor('not a url')).resolves.toHaveLength(1);
      await expect(
        externalUrlErrorsFor('javascript:alert(1)'),
      ).resolves.toHaveLength(1);
    });
  });
});
