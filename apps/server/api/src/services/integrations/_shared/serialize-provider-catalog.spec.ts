import {
  serializeProviderCatalog,
  throwProviderCatalogError,
} from '@api/services/integrations/_shared/serialize-provider-catalog';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('serializeProviderCatalog', () => {
  it('returns a JSON:API envelope without id', () => {
    expect(
      serializeProviderCatalog({
        attributes: { count: 2, provider: 'heygen', voices: [] },
        type: 'voices',
      }),
    ).toEqual({
      data: {
        attributes: { count: 2, provider: 'heygen', voices: [] },
        type: 'voices',
      },
    });
  });

  it('returns a JSON:API envelope with id', () => {
    expect(
      serializeProviderCatalog({
        attributes: { provider: 'heygen', voices: [] },
        id: 'heygen',
        type: 'voice-provider',
      }),
    ).toEqual({
      data: {
        attributes: { provider: 'heygen', voices: [] },
        id: 'heygen',
        type: 'voice-provider',
      },
    });
  });
});

describe('throwProviderCatalogError', () => {
  it('throws a 500 with title and error message', () => {
    expect(() =>
      throwProviderCatalogError(
        'Failed to fetch HeyGen voices',
        new Error('API key invalid'),
      ),
    ).toThrow(HttpException);

    try {
      throwProviderCatalogError(
        'Failed to fetch HeyGen voices',
        new Error('API key invalid'),
      );
    } catch (error) {
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(httpError.getResponse()).toEqual({
        detail: 'API key invalid',
        title: 'Failed to fetch HeyGen voices',
      });
    }
  });

  it('falls back when the thrown value has no message', () => {
    try {
      throwProviderCatalogError('Failed to fetch Hedra voices', 'string error');
    } catch (error) {
      const httpError = error as HttpException;
      expect(httpError.getResponse()).toEqual({
        detail: 'Unknown error occurred',
        title: 'Failed to fetch Hedra voices',
      });
    }
  });
});
