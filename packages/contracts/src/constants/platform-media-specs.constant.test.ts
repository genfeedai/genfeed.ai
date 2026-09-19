import { describe, expect, it } from 'vitest';
import { platformMediaSpecSchema } from '../api-types/contracts/media-readiness.contract';
import { CredentialPlatform } from '../enums';
import {
  getPlatformMediaSpec,
  getPlatformMediaSpecs,
  MEDIA_SPEC_PLATFORMS,
  PLATFORM_MEDIA_SPECS,
} from './platform-media-specs.constant';

const EXPECTED_PLATFORMS = [
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.THREADS,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.TWITTER,
  CredentialPlatform.YOUTUBE,
];

describe('PLATFORM_MEDIA_SPECS', () => {
  it('seeds every publish platform Genfeed supports today', () => {
    expect([...MEDIA_SPEC_PLATFORMS].sort()).toEqual(
      [...EXPECTED_PLATFORMS].sort(),
    );
  });

  it('holds one entry per platform and media kind', () => {
    const keys = PLATFORM_MEDIA_SPECS.map(
      (spec) => `${spec.platform}:${spec.kind}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe.each(
    PLATFORM_MEDIA_SPECS.map(
      (spec) => [spec.platform, spec.kind, spec] as const,
    ),
  )('%s %s', (platform, kind, spec) => {
    it('matches the contract shape', () => {
      expect(platformMediaSpecSchema.safeParse(spec).success).toBe(true);
    });

    it('cites the provider documentation it was transcribed from', () => {
      expect(spec.documentationUrl).toMatch(/^https:\/\//);
      expect(spec.sourcedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('carries at least one constraint worth checking', () => {
      const hasConstraint = [
        spec.maxDurationSeconds,
        spec.maxFileSizeBytes,
        spec.maxFrameRate,
        spec.maxHeight,
        spec.maxWidth,
        spec.minDurationSeconds,
        spec.minFrameRate,
        spec.minHeight,
        spec.minWidth,
      ].some((value) => value !== undefined);
      expect(
        hasConstraint ||
          spec.containers.length > 0 ||
          spec.aspectRatios.length > 0,
      ).toBe(true);
    });

    it('keeps every min below its matching max', () => {
      if (spec.minWidth !== undefined && spec.maxWidth !== undefined) {
        expect(spec.minWidth).toBeLessThanOrEqual(spec.maxWidth);
      }
      if (spec.minHeight !== undefined && spec.maxHeight !== undefined) {
        expect(spec.minHeight).toBeLessThanOrEqual(spec.maxHeight);
      }
      if (
        spec.minDurationSeconds !== undefined &&
        spec.maxDurationSeconds !== undefined
      ) {
        expect(spec.minDurationSeconds).toBeLessThanOrEqual(
          spec.maxDurationSeconds,
        );
      }
      if (spec.minFrameRate !== undefined && spec.maxFrameRate !== undefined) {
        expect(spec.minFrameRate).toBeLessThanOrEqual(spec.maxFrameRate);
      }
    });

    it('decides block-versus-warn in data, not in code', () => {
      expect(['error', 'info', 'warning']).toContain(spec.defaultSeverity);
      expect(spec.severities.probe).toBe('warning');
    });

    it('declares codecs only where they can be measured', () => {
      if (kind === 'image') {
        expect(spec.videoCodecs).toEqual([]);
        expect(spec.audioCodecs).toEqual([]);
      } else {
        expect(
          spec.videoCodecs.length + spec.audioCodecs.length,
        ).toBeGreaterThan(0);
      }
    });

    it('is reachable through the platform lookups', () => {
      expect(getPlatformMediaSpec(platform, kind)).toBe(spec);
      expect(getPlatformMediaSpecs(platform)).toContain(spec);
    });
  });

  it('returns nothing for a platform with no seeded spec', () => {
    expect(getPlatformMediaSpecs(CredentialPlatform.SLACK)).toEqual([]);
    expect(
      getPlatformMediaSpec(CredentialPlatform.SLACK, 'video'),
    ).toBeUndefined();
  });

  it('blocks an over-length video at the documented platform ceiling', () => {
    const tiktok = getPlatformMediaSpec(CredentialPlatform.TIKTOK, 'video');
    expect(tiktok?.maxDurationSeconds).toBe(600);
    expect(tiktok?.defaultSeverity).toBe('error');
  });
});
