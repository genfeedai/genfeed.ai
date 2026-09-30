import { describe, expect, it } from 'vitest';
import {
  getErrorStatus,
  getJsonApiErrorStatus,
  isAxiosError,
  parseHttpStatusCode,
} from './json-api-status.util';

describe('json-api-status.util (dependency-free — no @genfeedai/services import, #5199)', () => {
  describe('parseHttpStatusCode', () => {
    it.each([
      [404, 404],
      ['404', 404],
      [' 404 ', 404],
    ])('parses %p as %i', (input, expected) => {
      expect(parseHttpStatusCode(input)).toBe(expected);
    });

    it.each([undefined, null, 'NOT_FOUND', 'BRAND_SCRAPE_UNKNOWN', {}, []])(
      'returns undefined for %p',
      (input) => {
        expect(parseHttpStatusCode(input)).toBeUndefined();
      },
    );
  });

  describe('isAxiosError', () => {
    it('returns true only for an object with isAxiosError: true', () => {
      expect(isAxiosError({ isAxiosError: true })).toBe(true);
      expect(isAxiosError({ isAxiosError: false })).toBe(false);
      expect(isAxiosError(new Error('plain'))).toBe(false);
      expect(isAxiosError(null)).toBe(false);
    });
  });

  describe('getJsonApiErrorStatus', () => {
    it('reads status ahead of a non-numeric, semantic code (#5080 review)', () => {
      expect(
        getJsonApiErrorStatus({
          errors: [
            {
              code: 'BRAND_SCRAPE_UNKNOWN',
              detail: 'Failed to setup brand',
              status: '500',
              title: 'Brand Setup Failed',
            },
          ],
        }),
      ).toBe(500);
    });

    it('falls back to a status-shaped code when no status member is present', () => {
      expect(
        getJsonApiErrorStatus({
          errors: [{ code: '404', detail: 'x', title: 'x' }],
        }),
      ).toBe(404);
    });

    it('returns undefined for an empty errors array', () => {
      expect(getJsonApiErrorStatus({ errors: [] })).toBeUndefined();
    });
  });

  describe('getErrorStatus', () => {
    it('reads status from a JSON:API document with a semantic code (#5080/#5199)', () => {
      expect(
        getErrorStatus({
          errors: [
            {
              code: 'BRAND_SCRAPE_UNKNOWN',
              detail: 'x',
              status: '500',
              title: 'x',
            },
          ],
        }),
      ).toBe(500);
    });

    it('reads status from an axios-shaped error', () => {
      expect(
        getErrorStatus({ isAxiosError: true, response: { status: 404 } }),
      ).toBe(404);
    });

    it('reads status from an interceptor-sanitized Error', () => {
      expect(
        getErrorStatus(Object.assign(new Error('x'), { status: 404 })),
      ).toBe(404);
    });

    it('returns undefined for a plain Error without status', () => {
      expect(getErrorStatus(new Error('x'))).toBeUndefined();
    });
  });
});
