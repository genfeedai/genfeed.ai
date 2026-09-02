import { describe, expect, it } from 'vitest';
import { Platform } from '../../src/enums/platform.enum';
import {
  fromPrismaCredentialPlatform,
  isPrismaCredentialPlatform,
  PRISMA_CREDENTIAL_PLATFORM_VALUES,
  toPrismaCredentialPlatform,
} from '../../src/enums/platform-prisma.mapper';

describe('platform-prisma.mapper', () => {
  describe('toPrismaCredentialPlatform', () => {
    it('maps domain lowercase and Prisma SCREAMING to Prisma labels', () => {
      expect(toPrismaCredentialPlatform('instagram')).toBe('INSTAGRAM');
      expect(toPrismaCredentialPlatform('INSTAGRAM')).toBe('INSTAGRAM');
      expect(toPrismaCredentialPlatform('  Twitter  ')).toBe('TWITTER');
      expect(toPrismaCredentialPlatform('google-ads')).toBe('GOOGLE_ADS');
      expect(toPrismaCredentialPlatform('google_ads')).toBe('GOOGLE_ADS');
      expect(toPrismaCredentialPlatform('GOOGLE_SEARCH_CONSOLE')).toBe(
        'GOOGLE_SEARCH_CONSOLE',
      );
      expect(toPrismaCredentialPlatform('x_ads')).toBe('X_ADS');
      expect(toPrismaCredentialPlatform('x-ads')).toBe('X_ADS');
      expect(toPrismaCredentialPlatform('X_ADS')).toBe('X_ADS');
    });

    it('maps DEV_TO / devto aliases onto Prisma DEVTO', () => {
      expect(toPrismaCredentialPlatform(Platform.DEV_TO)).toBe('DEVTO');
      expect(toPrismaCredentialPlatform('devto')).toBe('DEVTO');
      expect(toPrismaCredentialPlatform('dev_to')).toBe('DEVTO');
      expect(toPrismaCredentialPlatform('DEV_TO')).toBe('DEVTO');
      expect(toPrismaCredentialPlatform('DEVTO')).toBe('DEVTO');
      expect(toPrismaCredentialPlatform('dev-to')).toBe('DEVTO');
    });

    it('accepts free-text aliases via parsePlatform', () => {
      expect(toPrismaCredentialPlatform('x')).toBe('TWITTER');
      expect(toPrismaCredentialPlatform('meta')).toBe('FACEBOOK');
    });

    it('rejects null, empty, domain-only, and unknown values', () => {
      expect(toPrismaCredentialPlatform(null)).toBeUndefined();
      expect(toPrismaCredentialPlatform(undefined)).toBeUndefined();
      expect(toPrismaCredentialPlatform('')).toBeUndefined();
      expect(toPrismaCredentialPlatform('   ')).toBeUndefined();
      expect(toPrismaCredentialPlatform(Platform.PRODUCT_HUNT)).toBeUndefined();
      expect(toPrismaCredentialPlatform(Platform.HACKER_NEWS)).toBeUndefined();
      expect(toPrismaCredentialPlatform('not-a-platform')).toBeUndefined();
    });
  });

  describe('fromPrismaCredentialPlatform', () => {
    it('maps Prisma SCREAMING labels to domain Platform values', () => {
      expect(fromPrismaCredentialPlatform('INSTAGRAM')).toBe(
        Platform.INSTAGRAM,
      );
      expect(fromPrismaCredentialPlatform('TWITTER')).toBe(Platform.TWITTER);
      expect(fromPrismaCredentialPlatform('GOOGLE_ADS')).toBe(
        Platform.GOOGLE_ADS,
      );
      expect(fromPrismaCredentialPlatform('X_ADS')).toBe(Platform.X_ADS);
      expect(fromPrismaCredentialPlatform('DEVTO')).toBe(Platform.DEV_TO);
      expect(fromPrismaCredentialPlatform('devto')).toBe(Platform.DEV_TO);
    });

    it('accepts domain lowercase already on the wire', () => {
      expect(fromPrismaCredentialPlatform('instagram')).toBe(
        Platform.INSTAGRAM,
      );
      expect(fromPrismaCredentialPlatform('x')).toBe(Platform.TWITTER);
    });

    it('rejects null and unknown', () => {
      expect(fromPrismaCredentialPlatform(null)).toBeUndefined();
      expect(fromPrismaCredentialPlatform('')).toBeUndefined();
      expect(fromPrismaCredentialPlatform('PRODUCT_HUNT')).toBeUndefined();
      expect(fromPrismaCredentialPlatform('not-a-platform')).toBeUndefined();
    });
  });

  describe('round-trip and inventory', () => {
    it('round-trips every domain Platform that exists on Prisma', () => {
      for (const domain of Object.values(Platform)) {
        const prisma = toPrismaCredentialPlatform(domain);
        if (!prisma) {
          // Domain-only product platforms have no credential column.
          expect([Platform.PRODUCT_HUNT, Platform.HACKER_NEWS]).toContain(
            domain,
          );
          continue;
        }
        expect(fromPrismaCredentialPlatform(prisma)).toBe(domain);
      }
    });

    it('round-trips every Prisma CredentialPlatform label', () => {
      for (const label of PRISMA_CREDENTIAL_PLATFORM_VALUES) {
        const domain = fromPrismaCredentialPlatform(label);
        expect(domain).toBeDefined();
        expect(toPrismaCredentialPlatform(domain)).toBe(label);
      }
    });

    it('exposes the Prisma inventory via isPrismaCredentialPlatform', () => {
      expect(isPrismaCredentialPlatform('INSTAGRAM')).toBe(true);
      expect(isPrismaCredentialPlatform('DEVTO')).toBe(true);
      expect(isPrismaCredentialPlatform('instagram')).toBe(false);
      expect(isPrismaCredentialPlatform('DEV_TO')).toBe(false);
    });
  });
});
