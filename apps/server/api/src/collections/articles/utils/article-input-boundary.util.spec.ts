import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { assertArticleOwnershipIds } from './article-input-boundary.util';

describe('article-input-boundary.util', () => {
  describe('assertArticleOwnershipIds', () => {
    it('accepts non-blank ownership identifiers', () => {
      expect(() =>
        assertArticleOwnershipIds('user-1', 'organization-1', 'brand-1'),
      ).not.toThrow();
    });

    it.each([
      ['', 'organization-1', 'brand-1', 'Invalid userId'],
      ['   ', 'organization-1', 'brand-1', 'Invalid userId'],
      ['user-1', '', 'brand-1', 'Invalid organizationId'],
      ['user-1', '   ', 'brand-1', 'Invalid organizationId'],
      ['user-1', 'organization-1', '', 'Invalid brandId'],
      ['user-1', 'organization-1', '   ', 'Invalid brandId'],
    ])(
      'rejects invalid ownership identifiers',
      (userId, organizationId, brandId, message) => {
        const assertOwnership = () =>
          assertArticleOwnershipIds(userId, organizationId, brandId);

        expect(assertOwnership).toThrow(BadRequestException);
        expect(assertOwnership).toThrow(message);
      },
    );

    it.each([
      ['', '', 'brand-1', 'Invalid userId'],
      ['user-1', '', '', 'Invalid organizationId'],
      ['', '', '', 'Invalid userId'],
    ])(
      'returns the highest-priority error when multiple ownership ids are invalid',
      (userId, organizationId, brandId, message) => {
        const assertOwnership = () =>
          assertArticleOwnershipIds(userId, organizationId, brandId);

        expect(assertOwnership).toThrow(BadRequestException);
        expect(assertOwnership).toThrow(message);
      },
    );
  });
});
