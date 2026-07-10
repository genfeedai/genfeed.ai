import {
  returnNotFound,
  setTopLinks,
} from '@api/helpers/utils/response/response.util';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('response.utils', () => {
  describe('returnNotFound', () => {
    it('throws a HttpException with not found message', () => {
      try {
        returnNotFound('User', '1');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(HttpException);
        const ex = e as HttpException;
        expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(ex.getResponse()).toEqual({
          detail: "User 1 doesn't exist",
          title: 'User not found',
        });
      }
    });
  });

  describe('setTopLinks', () => {
    it('emits pagination links from the AggregatePaginateResult shape returned by BaseService.findAll', () => {
      const req = { originalUrl: '/items?page=1' };
      const serializerOptions: Record<string, unknown> = {};
      const data = {
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 15,
        totalPages: 2,
      };

      const result = setTopLinks(req, serializerOptions, data);
      expect(result.topLevelLinks).toEqual({
        pagination: { limit: 10, page: 1, pages: 2, total: 15 },
        self: '/items?page=1',
      });
    });

    it('omits pagination for single-resource data', () => {
      const req = { originalUrl: '/items/1' };
      const result = setTopLinks(req, {}, { id: '1' });
      expect(result.topLevelLinks).toEqual({ self: '/items/1' });
    });
  });
});
