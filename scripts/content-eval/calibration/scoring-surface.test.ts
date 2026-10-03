import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCORING_SURFACE_LOCK_PATH } from './contracts';
import {
  buildScoringSurface,
  computeScoringSurface,
  fileDigest,
  readScoringSurfaceLock,
  readTextSurfaceValues,
  readVisionSurfaceValues,
} from './scoring-surface';
import type { ScoringSurfaceInput } from './types';

describe('scoring surface', () => {
  it('matches the committed scoring-surface lock', () => {
    expect(computeScoringSurface()).toEqual(readScoringSurfaceLock());
  });

  it('changes only the text digest when the content-quality model changes', () => {
    const input: ScoringSurfaceInput = {
      textFiles: [{ content: 'text rubric\n', path: 'text.ts' }],
      textValues: readTextSurfaceValues(),
      visionFiles: [{ content: 'vision rubric\n', path: 'vision.ts' }],
      visionValues: readVisionSurfaceValues(),
    };
    const baseline = buildScoringSurface(input);
    const changedValues = {
      ...input.textValues,
      contentQualityModel: 'calibration/changed-model',
    };
    const changed = buildScoringSurface({
      ...input,
      textValues: changedValues,
    });

    expect(changed.text.digest).not.toBe(baseline.text.digest);
    expect(changed.text.files).toEqual(baseline.text.files);
    expect(changed.text.values).toEqual(changedValues);
    expect(changed.vision).toEqual(baseline.vision);
    expect(changed.version).toBe(baseline.version);
  });

  it('normalizes CRLF to LF before hashing file contents', () => {
    expect(fileDigest('first\r\nsecond\r\n')).toBe(
      fileDigest('first\nsecond\n'),
    );
  });

  it('reports invalid lock JSON with the D-22.6 error', () => {
    const root = mkdtempSync(join(tmpdir(), 'calibration-surface-'));
    try {
      const path = join(root, SCORING_SURFACE_LOCK_PATH);
      const content = '{';
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      let message = '';
      try {
        JSON.parse(content);
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(() => readScoringSurfaceLock(root)).toThrow(
        new Error(`${SCORING_SURFACE_LOCK_PATH} is not valid JSON: ${message}`),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null when the lock is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'calibration-surface-'));
    try {
      expect(readScoringSurfaceLock(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
