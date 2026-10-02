import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import {
  PublicationInsightScopeQueryDto,
  PublicationInsightsQueryDto,
} from '@api/collections/posts/dto/publication-insights-query.dto';
import { TopContentQueryDto } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

const brandId = testId('brand');
const pipe = new ValidationPipe();
const parse = (query: Record<string, unknown>) =>
  pipe.transform(query, {
    type: 'query',
    metatype: PublicationInsightsQueryDto,
  });
describe('publication insight query boundary', () => {
  it('defaults canonical pagination and normalizes repeated account IDs', async () => {
    const credential = testId('credential');
    expect(
      await parse({
        brandId,
        credentialId: [credential, credential],
        capturedOnly: 'false',
      }),
    ).toMatchObject({
      brandId,
      page: 1,
      limit: 10,
      credentialId: [credential],
      capturedOnly: false,
    });
    expect(
      await parse({ brandId, credentialId: credential, capturedOnly: 'true' }),
    ).toMatchObject({ credentialId: [credential], capturedOnly: true });
  });
  it.each([
    {},
    { brandId: 'invalid' },
    { brandId, page: '0' },
    { brandId, limit: '101' },
    { brandId, page: '1.5' },
    { brandId, capturedOnly: '1' },
    { brandId, source: 'EXTENSION' },
    { brandId, platform: 'TWITTER' },
    { brandId, organizationId: testId('org') },
    { brandId, userId: testId('user') },
    { brandId, isDeleted: true },
    { brandId, credentialId: 'invalid' },
    { brandId, search: 'x'.repeat(257) },
    { brandId, externalId: '123' },
    { brandId, pageUrl: 'https://x.com/alice/status/123' },
    {
      brandId,
      platform: 'twitter',
      pageUrl: 'https://evil.example/alice/status/123',
    },
    { brandId, platform: 'twitter', pageUrl: 'http://x.com/alice/status/123' },
    {
      brandId,
      platform: 'youtube',
      pageUrl: 'https://youtube.com/watch?v=abcdefghijk&lc=bad invalid',
    },
  ])('rejects malformed or scope-forging query %j', async (query) => {
    await expect(parse(query)).rejects.toThrow();
  });
  it('rejects more than 100 distinct canonical account IDs', async () => {
    await expect(
      parse({
        brandId,
        credentialId: Array.from({ length: 101 }, (_, index) =>
          testId('credential', index + 1),
        ),
      }),
    ).rejects.toThrow();
  });

  it('accepts canonical own-status lookup and rejects list fields on detail', async () => {
    expect(
      await parse({
        brandId,
        platform: 'twitter',
        pageUrl: 'https://x.com/alice/status/123',
        externalId: '123',
        source: 'extension',
      }),
    ).toMatchObject({ platform: 'twitter', externalId: '123' });
    await expect(
      pipe.transform(
        { brandId, page: 1 },
        { type: 'query', metatype: PublicationInsightScopeQueryDto },
      ),
    ).rejects.toThrow();
  });
  it.each([PostsQueryDto, TopContentQueryDto])(
    'accepts only lowercase persisted source in %s',
    async (metatype) => {
      expect(
        await pipe.transform(
          { source: 'extension' },
          { type: 'query', metatype },
        ),
      ).toMatchObject({ source: 'extension' });
      await expect(
        pipe.transform({ source: 'EXTENSION' }, { type: 'query', metatype }),
      ).rejects.toThrow();
    },
  );
});
