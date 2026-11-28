import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  discardVideoOutput,
  requireVideoOutputPath,
} from './video-processing-result.util';

describe('requireVideoOutputPath', () => {
  it('returns a non-empty output path', () => {
    expect(requireVideoOutputPath('/tmp/video.mp4')).toBe('/tmp/video.mp4');
  });

  it.each([[''], [null], [undefined], [123], [{}]])(
    'rejects %p as a missing output path',
    (value) => {
      expect(() => requireVideoOutputPath(value)).toThrow(
        'Video processing result missing outputPath',
      );
    },
  );
});

describe('discardVideoOutput', () => {
  it('deletes the output file the worker left for the upload', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'discard-output-'));
    const output = path.join(dir, 'output.mp4');
    writeFileSync(output, 'video');

    try {
      discardVideoOutput(output, { warn: vi.fn() });
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('warns instead of throwing when the file is already gone', () => {
    const warn = vi.fn();

    expect(() =>
      discardVideoOutput('/nonexistent/output.mp4', { warn }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      'Failed to cleanup temp file: /nonexistent/output.mp4',
      expect.any(Error),
    );
  });
});
