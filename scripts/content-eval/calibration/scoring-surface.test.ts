import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCalibrationGate } from '../../ci/calibration-gate';
import { readRepoRoot } from '../provenance';
import { SCORING_SURFACE_LOCK_PATH } from './contracts';
import {
  buildScoringSurface,
  computeScoringSurface,
  fileDigest,
  readScoringSurfaceLock,
  readTextSurfaceValues,
  readVisionSurfaceValues,
  TEXT_SURFACE_FILES,
  VISION_SURFACE_FILES,
} from './scoring-surface';
import type { ScoringSurfaceInput } from './types';

const EVALUATIONS_SERVICE_PATH =
  'apps/server/api/src/collections/evaluations/services/evaluations.service.ts';
const JUDGE_INPUT_PATH =
  'apps/server/api/src/collections/evaluations/services/evaluation-judge-input.ts';
const PROMPTS_PATH =
  'apps/server/api/src/services/content-quality/content-quality-scorer.prompts.ts';
const RUBRICS_PATH = 'scripts/content-eval/scorers/rubrics.ts';
const MODEL_CONSTANT_PATH =
  'apps/server/api/src/constants/default-text-model.constant.ts';

function withSurfaceCopy<T>(run: (root: string) => T): T {
  const repoRoot = readRepoRoot();
  const root = mkdtempSync(join(tmpdir(), 'calibration-surface-copy-'));
  try {
    for (const path of [
      ...TEXT_SURFACE_FILES,
      ...VISION_SURFACE_FILES,
      EVALUATIONS_SERVICE_PATH,
    ]) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(repoRoot, path), target);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('scoring surface', () => {
  it('keeps evaluations.service.ts off the text surface', () => {
    expect(TEXT_SURFACE_FILES).not.toContain(EVALUATIONS_SERVICE_PATH);
  });

  it('keeps the scorer prompts, rubrics, model and operations service on the text surface', () => {
    expect(TEXT_SURFACE_FILES).toEqual(
      expect.arrayContaining([
        PROMPTS_PATH,
        JUDGE_INPUT_PATH,
        RUBRICS_PATH,
        MODEL_CONSTANT_PATH,
        'apps/server/api/src/collections/evaluations/services/evaluations-operations.service.ts',
        'apps/server/api/src/collections/evaluations/services/evaluation-result.projection.ts',
        'apps/server/api/src/services/content-quality/content-quality-scorer.service.ts',
      ]),
    );
  });

  it('leaves the text digest unchanged for a non-scoring evaluations.service.ts edit', () => {
    withSurfaceCopy((root) => {
      const baseline = computeScoringSurface(root);
      appendFileSync(
        join(root, EVALUATIONS_SERVICE_PATH),
        '\n// billing attribution change\n',
      );

      expect(computeScoringSurface(root)).toEqual(baseline);
    });
  });

  it.each([
    ['prompt', PROMPTS_PATH],
    [
      'judge input assembly (article content, post children, contexts)',
      JUDGE_INPUT_PATH,
    ],
    ['rubric', RUBRICS_PATH],
    ['model constant', MODEL_CONSTANT_PATH],
  ])(
    'trips link-missing on a pull request when the %s file changes',
    (_label, path) => {
      withSurfaceCopy((root) => {
        const baseline = computeScoringSurface(root);
        appendFileSync(join(root, path), '\n// scoring change\n');
        const head = computeScoringSurface(root);

        expect(head.text.digest).not.toBe(baseline.text.digest);
        expect(
          evaluateCalibrationGate({
            baseLock: baseline,
            event: 'pull_request',
            headLock: head,
            headSurface: head,
            prBody: 'Refs #4924\n',
            readSummary: () => ({ isPresent: false }),
          }),
        ).toMatchObject({ code: 'link-missing', isPassing: false });
      });
    },
  );

  it('passes the gate as unchanged for a non-scoring evaluations.service.ts edit', () => {
    withSurfaceCopy((root) => {
      const baseline = computeScoringSurface(root);
      appendFileSync(join(root, EVALUATIONS_SERVICE_PATH), '\n// billing\n');
      const head = computeScoringSurface(root);

      expect(
        evaluateCalibrationGate({
          baseLock: baseline,
          event: 'pull_request',
          headLock: baseline,
          headSurface: head,
          prBody: '',
          readSummary: () => ({ isPresent: false }),
        }),
      ).toMatchObject({ code: 'unchanged', isPassing: true });
    });
  });

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
