import { describe, expect, it } from 'vitest';
import { MediaReadinessDiagnosticSerializer } from '../server/content/media-readiness-diagnostic.serializer';
import {
  type MediaReadinessDiagnosticInput,
  toMediaReadinessDiagnosticRecord,
  toMediaReadinessDiagnosticRecords,
} from './media-readiness-diagnostic.helper';

const DIAGNOSTIC: MediaReadinessDiagnosticInput = {
  actual: '1200s',
  assetId: 'asset-1',
  code: 'media_duration_above_maximum',
  kind: 'video',
  limit: 'maximum 600s',
  message: 'tiktok: Duration 1200s exceeds the maximum of 600s.',
  platform: 'tiktok',
  property: 'duration',
  severity: 'error',
};

describe('toMediaReadinessDiagnosticRecord', () => {
  it('derives a stable id from the violation identity', () => {
    expect(toMediaReadinessDiagnosticRecord(DIAGNOSTIC).id).toBe(
      'asset-1:tiktok:duration:media_duration_above_maximum',
    );
    expect(toMediaReadinessDiagnosticRecord(DIAGNOSTIC).id).toBe(
      toMediaReadinessDiagnosticRecord({ ...DIAGNOSTIC }).id,
    );
  });

  it('keeps distinct violations on distinct ids', () => {
    const records = toMediaReadinessDiagnosticRecords([
      DIAGNOSTIC,
      {
        ...DIAGNOSTIC,
        code: 'media_fileSize_above_maximum',
        property: 'fileSize',
      },
    ]);

    expect(new Set(records.map((record) => record.id)).size).toBe(2);
  });
});

describe('MediaReadinessDiagnosticSerializer', () => {
  it('serializes the diagnostic attributes under its own type', () => {
    const payload = MediaReadinessDiagnosticSerializer.serialize(
      toMediaReadinessDiagnosticRecord(DIAGNOSTIC),
    ) as {
      data: { attributes: Record<string, unknown>; id: string; type: string };
    };

    expect(payload.data.type).toBe('media-readiness-diagnostic');
    expect(payload.data.id).toBe(
      'asset-1:tiktok:duration:media_duration_above_maximum',
    );
    expect(payload.data.attributes).toEqual(
      expect.objectContaining({
        actual: '1200s',
        limit: 'maximum 600s',
        property: 'duration',
        severity: 'error',
      }),
    );
  });
});
