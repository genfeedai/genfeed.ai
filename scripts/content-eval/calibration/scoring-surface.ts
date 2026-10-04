import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { PromptTemplateKey, SystemPromptKey } from '@genfeedai/contracts';
import { CONTENT_QUALITY_SCORING_SCHEMA_NAME } from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { MEDIA_RUBRIC_VERSION } from '../media/contracts';
import { canonicalJson, readRepoRoot, sha256Digest } from '../provenance';
import type {
  ScoringSurface,
  SurfaceFile,
  TextSurfaceValues,
  VisionSurfaceValues,
} from './contracts';
import {
  SCORING_SURFACE_LOCK_PATH,
  SCORING_SURFACE_VERSION,
  scoringSurfaceSchema,
} from './contracts';
import type { ScoringSurfaceInput, SurfaceFileContent } from './types';

// Every file here can change what a text judge scores. The calibration bridge
// (live-evaluations.ts) drives EvaluationsOperationsService directly, so
// evaluations.service.ts (credit billing, persistence, caching, websockets) is
// deliberately absent: it cannot alter a score. The content selection and judge
// context it passes on are assembled in evaluation-judge-input.ts and
// evaluation-result.projection.ts, which stay on the surface.
export const TEXT_SURFACE_FILES: readonly string[] = [
  'apps/server/api/src/collections/evaluations/services/evaluation-judge-input.ts',
  'apps/server/api/src/collections/evaluations/services/evaluation-result.projection.ts',
  'apps/server/api/src/collections/evaluations/services/evaluations-operations.service.ts',
  'apps/server/api/src/constants/default-text-model.constant.ts',
  'apps/server/api/src/services/content-quality/content-quality-scorer.prompts.ts',
  'apps/server/api/src/services/content-quality/content-quality-scorer.service.ts',
  'packages/harness/src/persuasion/viral-psychology.ts',
  'scripts/content-eval/scorers/rubrics.ts',
];

export const VISION_SURFACE_FILES: readonly string[] = [
  'scripts/content-eval/media/judge.ts',
];

export function fileDigest(content: string): string {
  return sha256Digest(content.replace(/\r\n/g, '\n'));
}

export function readTextSurfaceValues(): TextSurfaceValues {
  return {
    contentQualityModel: LLM_DEFAULTS.background,
    evaluationTemplates: {
      article: PromptTemplateKey.EVALUATION_ARTICLE,
      post: PromptTemplateKey.EVALUATION_POST,
      system: SystemPromptKey.EVALUATION,
    },
    evaluationsModel: DEFAULT_TEXT_MODEL,
    scoringSchema: CONTENT_QUALITY_SCORING_SCHEMA_NAME,
  };
}

export function readVisionSurfaceValues(): VisionSurfaceValues {
  return {
    mediaRubricVersion: MEDIA_RUBRIC_VERSION,
    scorerVisionModel: LLM_DEFAULTS.fastText,
    visionTemplates: {
      image: PromptTemplateKey.EVALUATION_IMAGE,
      video: PromptTemplateKey.EVALUATION_VIDEO,
    },
  };
}

function digestFiles(contents: SurfaceFileContent[]): SurfaceFile[] {
  return contents
    .map(({ content, path }) => ({ digest: fileDigest(content), path }))
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
}

export function buildScoringSurface(
  input: ScoringSurfaceInput,
): ScoringSurface {
  const text = {
    files: digestFiles(input.textFiles),
    values: input.textValues,
  };
  const vision = {
    files: digestFiles(input.visionFiles),
    values: input.visionValues,
  };
  return {
    text: { digest: sha256Digest(canonicalJson(text)), ...text },
    version: SCORING_SURFACE_VERSION,
    vision: { digest: sha256Digest(canonicalJson(vision)), ...vision },
  };
}

function readSurfaceFiles(
  paths: readonly string[],
  repoRoot: string,
): SurfaceFileContent[] {
  return paths.map((path) => {
    const absolutePath = resolve(repoRoot, path);
    if (!existsSync(absolutePath)) {
      throw new Error(`scoring surface file missing: ${path}`);
    }
    return { content: readFileSync(absolutePath, 'utf8'), path };
  });
}

export function computeScoringSurface(
  repoRoot: string = readRepoRoot(),
): ScoringSurface {
  return buildScoringSurface({
    textFiles: readSurfaceFiles(TEXT_SURFACE_FILES, repoRoot),
    textValues: readTextSurfaceValues(),
    visionFiles: readSurfaceFiles(VISION_SURFACE_FILES, repoRoot),
    visionValues: readVisionSurfaceValues(),
  });
}

export function readScoringSurfaceLock(
  repoRoot: string = readRepoRoot(),
): ScoringSurface | null {
  const path = resolve(repoRoot, SCORING_SURFACE_LOCK_PATH);
  if (!existsSync(path)) {
    return null;
  }
  const content = readFileSync(path, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${SCORING_SURFACE_LOCK_PATH} is not valid JSON: ${message}`,
    );
  }
  const parsed = scoringSurfaceSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `${SCORING_SURFACE_LOCK_PATH} does not match scoringSurfaceSchema: ${issues}`,
    );
  }
  return parsed.data;
}

export function writeScoringSurfaceLock(
  surface: ScoringSurface,
  repoRoot: string = readRepoRoot(),
): void {
  writeFileSync(
    resolve(repoRoot, SCORING_SURFACE_LOCK_PATH),
    `${JSON.stringify(surface, null, 2)}\n`,
  );
}

if (import.meta.main) {
  try {
    const surface = computeScoringSurface();
    if (process.argv.includes('--write')) {
      writeScoringSurfaceLock(surface);
      process.stdout.write(
        `scoring-surface lock written: ${SCORING_SURFACE_LOCK_PATH}\n`,
      );
    } else {
      process.stdout.write(`${JSON.stringify(surface, null, 2)}\n`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Scoring surface failed: ${message}\n`);
    process.exitCode = 1;
  }
}
