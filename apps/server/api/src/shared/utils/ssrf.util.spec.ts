import { BadRequestException } from '@nestjs/common';
import { assertHostNotPrivate, assertUrlNotPrivate } from './ssrf.util';

describe('ssrf.util', () => {
  describe('assertHostNotPrivate', () => {
    it.each([
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      'metadata.google.internal',
      '169.254.169.254',
      '10.0.0.5',
      '172.16.1.1',
      '172.31.255.255',
      '192.168.1.1',
      'service.internal',
      'printer.local',
    ])('blocks %s', (host) => {
      expect(() => assertHostNotPrivate(host)).toThrow(BadRequestException);
    });

    it.each([
      'genfeed.ai',
      'api.genfeed.ai',
      'mastodon.social',
      '8.8.8.8',
      '172.32.0.1', // just outside 172.16/12
      '11.0.0.1', // just outside 10/8
    ])('allows %s', (host) => {
      expect(() => assertHostNotPrivate(host)).not.toThrow();
    });
  });

  describe('assertUrlNotPrivate', () => {
    it('blocks the cloud metadata endpoint', () => {
      expect(() =>
        assertUrlNotPrivate('http://169.254.169.254/latest/meta-data/'),
      ).toThrow(BadRequestException);
    });

    it('rejects unparseable URLs', () => {
      expect(() => assertUrlNotPrivate('not a url')).toThrow(
        BadRequestException,
      );
    });

    it('allows public URLs', () => {
      expect(() =>
        assertUrlNotPrivate('https://example.com/page'),
      ).not.toThrow();
    });
  });
});
