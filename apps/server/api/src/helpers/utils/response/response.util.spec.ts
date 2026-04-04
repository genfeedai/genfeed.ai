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
    it('sets top level links using request url and data', () => {
      const req = { originalUrl: '/items?page=1' };
      const serializerOptions: Record<string, unknown> = {};
      const data = { docs: [], limit: 10, page: 1, pages: 2, total: 5 };

      const result = setTopLinks(req, serializerOptions, data);
      expect(result.topLevelLinks).toEqual({
        pagination: { limit: 10, page: 1, pages: 2, total: 5 },
        self: '/items?page=1',
      });
    });
  });
});
