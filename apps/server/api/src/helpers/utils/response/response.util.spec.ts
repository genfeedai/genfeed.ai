import { returnNotFound } from '@api/helpers/utils/response/response.util';
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
});
