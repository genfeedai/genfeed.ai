import { throwProviderCatalogError } from '@api/services/integrations/_shared/serialize-provider-catalog';
import { HttpException, HttpStatus } from '@nestjs/common';

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
});
