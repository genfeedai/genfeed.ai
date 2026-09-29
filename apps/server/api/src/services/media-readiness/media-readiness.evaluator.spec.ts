import {
  evaluateMediaReadiness,
  formatMediaReadinessBlockers,
  hasPlatformMediaSpecs,
  readBlockingDiagnostics,
  readWarningDiagnostics,
} from '@api/services/media-readiness/media-readiness.evaluator';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  MediaProbe,
  MediaReadinessKind,
} from '@genfeedai/contracts/api-types/contracts';
import { getPlatformMediaSpec } from '@genfeedai/contracts/constants';
import type { IMediaReadinessAsset } from '@genfeedai/contracts/interfaces';

function probe(
  kind: MediaReadinessKind,
  overrides: Partial<MediaProbe> = {},
): MediaProbe {
  const base: MediaProbe =
    kind === 'video'
      ? {
          audioCodec: 'aac',
          container: 'mov,mp4,m4a,3gp,3g2,mj2',
          durationSeconds: 30,
          frameRate: 30,
          height: 1920,
          kind: 'video',
          probedAt: '2026-09-19T10:00:00.000Z',
          sizeBytes: 12 * 1024 * 1024,
          videoCodec: 'h264',
          width: 1080,
        }
      : {
          audioCodec: null,
          container: 'jpeg',
          durationSeconds: null,
          frameRate: null,
          height: 1350,
          kind: 'image',
          probedAt: '2026-09-19T10:00:00.000Z',
          sizeBytes: 2 * 1024 * 1024,
          videoCodec: null,
          width: 1080,
        };
  return { ...base, ...overrides };
}

function asset(
  kind: MediaReadinessKind,
  overrides: Partial<MediaProbe> = {},
  assetId = 'asset-1',
): IMediaReadinessAsset {
  return { assetId, kind, probe: probe(kind, overrides) };
}

describe('evaluateMediaReadiness', () => {
  it('passes a compliant reel with no diagnostics', () => {
    const report = evaluateMediaReadiness({
      assets: [asset('video')],
      platforms: [CredentialPlatform.INSTAGRAM],
    });

    expect(report.diagnostics).toEqual([]);
    expect(report.isBlocked).toBe(false);
  });

  it('blocks a video over the platform maximum duration, naming duration, actual and limit', () => {
    const report = evaluateMediaReadiness({
      assets: [asset('video', { durationSeconds: 1200 })],
      platforms: [CredentialPlatform.TIKTOK],
    });

    const blockers = readBlockingDiagnostics(report);
    expect(report.isBlocked).toBe(true);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toEqual(
      expect.objectContaining({
        actual: '1200s',
        assetId: 'asset-1',
        code: 'media_duration_above_maximum',
        limit: 'maximum 600s',
        platform: CredentialPlatform.TIKTOK,
        property: 'duration',
        severity: 'error',
      }),
    );
    expect(formatMediaReadinessBlockers(blockers)).toContain('1200s');
  });

  it('blocks a video under the platform minimum duration', () => {
    const report = evaluateMediaReadiness({
      assets: [asset('video', { durationSeconds: 1 })],
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(readBlockingDiagnostics(report)[0]).toEqual(
      expect.objectContaining({
        code: 'media_duration_below_minimum',
        limit: 'minimum 3s',
        property: 'duration',
      }),
    );
  });

  it('takes aspect-ratio block-versus-warn from the spec entry, not from code', () => {
    const instagramImage = getPlatformMediaSpec(
      CredentialPlatform.INSTAGRAM,
      'image',
    );
    expect(instagramImage?.severities.aspectRatio).toBe('warning');
    expect(instagramImage?.defaultSeverity).toBe('error');

    const report = evaluateMediaReadiness({
      assets: [asset('image', { height: 360, width: 1440 })],
      platforms: [CredentialPlatform.INSTAGRAM],
    });

    const warnings = readWarningDiagnostics(report);
    expect(report.isBlocked).toBe(false);
    expect(warnings.map((diagnostic) => diagnostic.property)).toContain(
      'aspectRatio',
    );
    expect(warnings[0]?.limit).toContain('4:5');
  });

  it('blocks an oversized image on file size', () => {
    const report = evaluateMediaReadiness({
      assets: [asset('image', { sizeBytes: 12 * 1024 * 1024 })],
      platforms: [CredentialPlatform.INSTAGRAM],
    });

    expect(readBlockingDiagnostics(report)[0]).toEqual(
      expect.objectContaining({
        actual: '12MB',
        code: 'media_fileSize_above_maximum',
        limit: 'maximum 8MB',
        property: 'fileSize',
      }),
    );
  });

  it('blocks an unsupported video codec', () => {
    const report = evaluateMediaReadiness({
      assets: [asset('video', { durationSeconds: 60, videoCodec: 'vp9' })],
      platforms: [CredentialPlatform.TWITTER],
    });

    expect(
      readBlockingDiagnostics(report).map((diagnostic) => diagnostic.property),
    ).toContain('videoCodec');
  });

  it('reports a probe diagnostic at the spec severity when an asset has none', () => {
    const report = evaluateMediaReadiness({
      assets: [{ assetId: 'asset-9', kind: 'video', probe: null }],
      platforms: [CredentialPlatform.INSTAGRAM],
    });

    expect(report.isBlocked).toBe(false);
    expect(readWarningDiagnostics(report)[0]).toEqual(
      expect.objectContaining({
        code: 'media_probe_unavailable',
        property: 'probe',
        severity: 'warning',
      }),
    );
  });

  it('blocks a video under the documented LinkedIn file-size floor', () => {
    const report = evaluateMediaReadiness({
      assets: [
        asset('video', {
          container: 'mp4',
          durationSeconds: 30,
          sizeBytes: 40 * 1024,
        }),
      ],
      platforms: [CredentialPlatform.LINKEDIN],
    });

    expect(readBlockingDiagnostics(report)).toContainEqual(
      expect.objectContaining({
        code: 'media_fileSize_below_minimum',
        property: 'fileSize',
        severity: 'error',
      }),
    );
  });

  it('reports a constrained property with no measured value instead of passing it', () => {
    const report = evaluateMediaReadiness({
      assets: [asset('video', { durationSeconds: null })],
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(report.isBlocked).toBe(false);
    expect(readWarningDiagnostics(report)).toContainEqual(
      expect.objectContaining({
        actual: 'unknown',
        code: 'media_duration_not_measured',
        property: 'probe',
        severity: 'warning',
      }),
    );
  });

  it('blocks an attached id that did not resolve, once per target platform', () => {
    const report = evaluateMediaReadiness({
      assets: [],
      platforms: [CredentialPlatform.TIKTOK, CredentialPlatform.TWITTER],
      unresolvedAssetIds: ['asset-missing'],
    });

    const blockers = readBlockingDiagnostics(report);
    expect(report.isBlocked).toBe(true);
    expect(blockers).toHaveLength(2);
    expect(blockers[0]).toEqual(
      expect.objectContaining({
        assetId: 'asset-missing',
        code: 'media_asset_unresolved',
        kind: null,
        property: 'asset',
        severity: 'error',
      }),
    );
  });

  it('stays silent for a platform and kind with no seeded spec', () => {
    const report = evaluateMediaReadiness({
      assets: [asset('audio')],
      platforms: [CredentialPlatform.SLACK, CredentialPlatform.TWITTER],
    });

    expect(report.diagnostics).toEqual([]);
  });
});

describe('hasPlatformMediaSpecs', () => {
  it('is true only for seeded platforms', () => {
    expect(hasPlatformMediaSpecs(CredentialPlatform.YOUTUBE)).toBe(true);
    expect(hasPlatformMediaSpecs(CredentialPlatform.SLACK)).toBe(false);
  });
});
