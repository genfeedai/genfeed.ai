import {
  extractKnowledgeRefreshSourceText,
  KnowledgeSourceUnavailableException,
} from '@api/collections/contexts/utils/knowledge-refresh-source-error.util';
import { KnowledgeBaseCategory } from '@genfeedai/contracts';
import { DestinationGuardError } from '@libs/security/destination-guard';
import { BadRequestException } from '@nestjs/common';

const detail =
  'The source could not be reached. Check its URL and availability, then try again.';
const codes = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
];
function rejectExtraction(error: unknown) {
  return extractKnowledgeRefreshSourceText({
    category: KnowledgeBaseCategory.URL,
    referenceUrl: 'https://private.invalid/path?token=secret',
    fetchImpl: async () => {
      throw error;
    },
  });
}

describe('knowledge refresh extraction errors', () => {
  it.each(codes)(
    'normalizes direct and nested %s without exposing private details',
    async (code) => {
      const original = Object.assign(
        new Error('private.invalid token=secret'),
        { code },
      );
      for (const error of [
        original,
        new Error('fetch failed', { cause: original }),
      ]) {
        const result = await rejectExtraction(error).catch(
          (failure: unknown) => failure,
        );
        expect(result).toBeInstanceOf(KnowledgeSourceUnavailableException);
        if (!(result instanceof KnowledgeSourceUnavailableException))
          throw new Error('Expected typed source error');
        expect(result.getStatus()).toBe(422);
        expect(result.message).toBe(detail);
        expect(result.networkCode).toBe(code);
        expect(result.getResponse()).toEqual({
          title: 'Knowledge source unavailable',
          detail,
        });
        expect(JSON.stringify(result)).not.toMatch(
          /private\.invalid|token=secret|fetch failed/,
        );
        expect(result.cause).toBeUndefined();
      }
    },
  );

  it.each([
    new TypeError('programming defect'),
    new Error('ENOTFOUND text alone'),
    { code: 'UNKNOWN', message: 'network timeout' },
    'ENOTFOUND',
    Object.assign(new BadRequestException('invalid input'), {
      code: 'ENOTFOUND',
    }),
    Object.assign(new DestinationGuardError('blocked private address'), {
      code: 'ENOTFOUND',
    }),
    Object.assign(new Error('outer'), {
      code: 'ENOTFOUND',
      cause: new DestinationGuardError('blocked'),
    }),
    Object.assign(new Error('outer'), {
      code: 'ENOTFOUND',
      cause: new BadRequestException('invalid'),
    }),
  ])('preserves unknown and protected error identity (%#)', async (error) => {
    await expect(rejectExtraction(error)).rejects.toBe(error);
  });

  it('terminates cyclic chains, converting only a recognized code', async () => {
    const cycle: { cause?: unknown; code?: string } = {};
    cycle.cause = cycle;
    await expect(rejectExtraction(cycle)).rejects.toBe(cycle);
    cycle.code = 'ENOTFOUND';
    await expect(rejectExtraction(cycle)).rejects.toBeInstanceOf(
      KnowledgeSourceUnavailableException,
    );
  });

  it('does not inspect causes beyond the 16-object bound', async () => {
    let chain: unknown = { code: 'ENOTFOUND' };
    for (let index = 0; index < 16; index += 1) chain = { cause: chain };
    await expect(rejectExtraction(chain)).rejects.toBe(chain);
  });

  it('preserves successful extraction', async () => {
    await expect(
      extractKnowledgeRefreshSourceText({
        category: KnowledgeBaseCategory.URL,
        capturedText: 'Captured content',
        referenceUrl: 'https://example.com',
      }),
    ).resolves.toMatchObject({ text: 'Captured content' });
  });

  it('preserves malformed feed errors', async () => {
    await expect(
      extractKnowledgeRefreshSourceText({
        category: KnowledgeBaseCategory.RSS,
        referenceUrl: 'https://example.com/feed',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => 'not a feed',
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      }),
    ).rejects.toThrow('Source is not a valid RSS or Atom feed');
  });
});
