import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_BRIEF_IMAGE_EVAL_SCENARIOS,
  GENERATION_BRIEF_VIDEO_EVAL_SCENARIOS,
} from '@api/services/generation-brief/generation-brief-eval-corpus';
import { z } from 'zod';
import { type Task, taskSchema } from '../bench/schema';
import {
  type BrandKit,
  brandKitSchema,
  type MediaTask,
  type Medium,
  mediaTaskSchema,
} from './contracts';

/**
 * Task packs for the media ladder. The public pack is a verbatim copy of
 * genfeedai/benchmark at BENCH_TASK_PACK_REVISION (drift-tested against the
 * sibling checkout); the generation-brief corpus is replayed as internal
 * tasks; private brand tasks load from genfeedai/harness and stay private.
 */

export const BENCH_TASK_PACK_REVISION =
  '851b7c85dab18e39342f3bd017ae776f39b3c35e';

export const BENCH_TASK_PACK_DIR = fileURLToPath(
  new URL('./tasks/bench-851b7c8', import.meta.url),
);

export const KELDER_BRAND_KEY = 'kelder';
export const AURORA_BRAND_KEY = 'aurora';

/** Relative location inside a genfeedai/harness checkout. */
export const PRIVATE_MEDIA_TASK_SUBDIR = join('src', 'data', 'evals', 'media');

const privateMediaTaskFileSchema = z.object({
  task: taskSchema,
  brandKey: z.string().min(1),
  evaluationCriteria: z.array(z.string().min(1)).default([]),
});

export interface LoadTaskOptions {
  medium: Medium;
  includeDrafts: boolean;
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function loadKelderBrandKit(): Promise<BrandKit> {
  return brandKitSchema.parse(
    await readJson(join(BENCH_TASK_PACK_DIR, 'kelder-brand-kit.json')),
  );
}

export async function loadBenchTasks(
  options: LoadTaskOptions,
): Promise<MediaTask[]> {
  const paths = await listJsonFiles(join(BENCH_TASK_PACK_DIR, options.medium));
  const tasks: MediaTask[] = [];
  for (const path of paths) {
    const task = taskSchema.parse(await readJson(path));
    if (task.medium !== options.medium) {
      throw new Error(
        `${relative(BENCH_TASK_PACK_DIR, path)} is ${task.medium}, expected ${options.medium}`,
      );
    }
    if (task.isDraft && !options.includeDrafts) continue;
    tasks.push(
      mediaTaskSchema.parse({
        brandKey: task.referenceRoles.includes('brand-kit')
          ? KELDER_BRAND_KEY
          : null,
        evaluationCriteria: [],
        source: 'bench',
        task,
        visibility: 'public',
      }),
    );
  }
  return tasks;
}

const CORPUS_RUBRIC = [
  'Does the output depict exactly what the objective asks for?',
  'Are any explicit constraints in the objective (count, text, framing, motion) met?',
  'Where a brand is supplied, does the output read as that brand rather than generic stock?',
  'Craft, only after the checks above',
];

/**
 * The 24 #3470 compile scenarios as internal tasks. Guided/strict scenarios
 * reference the Aurora bottle brand the #3470 grid used; unbranded ones carry
 * no brand. The per-scenario model is dropped: on the ladder every contestant
 * plays every task.
 */
export function buildGenerationBriefCorpusTasks(medium: Medium): MediaTask[] {
  const scenarios =
    medium === 'image'
      ? GENERATION_BRIEF_IMAGE_EVAL_SCENARIOS
      : GENERATION_BRIEF_VIDEO_EVAL_SCENARIOS;
  return scenarios.map((scenario) => {
    const hasProductReference =
      'references' in scenario &&
      scenario.references.some((reference) => reference.role === 'product');
    const isBranded = scenario.fidelityMode !== 'off';
    const task: Task = taskSchema.parse({
      id: `corpus-${scenario.id}`,
      isDraft: false,
      medium,
      outputSpec:
        medium === 'image'
          ? { aspectRatio: '16:9', count: 1 }
          : { aspectRatio: '16:9', count: 1, durationSeconds: 5 },
      prompt: scenario.objective,
      rationale: `Generation-brief corpus scenario ${scenario.id} (#3470), replayed as an internal ladder task.`,
      referenceRoles: hasProductReference ? ['product-shot'] : ['none'],
      rubric: CORPUS_RUBRIC,
      title: scenario.id,
      version: 1,
    });
    return mediaTaskSchema.parse({
      brandKey: isBranded ? AURORA_BRAND_KEY : null,
      evaluationCriteria: [],
      source: 'generation-brief-corpus',
      task,
      visibility: 'public',
    });
  });
}

/**
 * Private brand tasks from a genfeedai/harness checkout. Each file is
 * `{ task, brandKey, evaluationCriteria }`; the task uses the bench shape.
 */
export async function loadPrivateMediaTasks(
  harnessDir: string,
  options: LoadTaskOptions,
): Promise<MediaTask[]> {
  const root = join(harnessDir, PRIVATE_MEDIA_TASK_SUBDIR);
  const tasks: MediaTask[] = [];
  for (const path of await listJsonFiles(root)) {
    const file = privateMediaTaskFileSchema.parse(await readJson(path));
    if (file.task.medium !== options.medium) continue;
    if (file.task.isDraft && !options.includeDrafts) continue;
    tasks.push(
      mediaTaskSchema.parse({
        brandKey: file.brandKey,
        evaluationCriteria: file.evaluationCriteria,
        source: 'private-harness',
        task: file.task,
        visibility: 'private',
      }),
    );
  }
  return tasks;
}

/** Kit as plain text, handed identically to every contestant on brand-kit tasks. */
export function renderBrandKit(kit: BrandKit): string {
  const palette = Object.entries(kit.palette)
    .map(([name, hex]) => `${name} ${hex}`)
    .join(', ');
  return [
    `Brand kit: ${kit.name}.`,
    `Palette: ${palette}.`,
    `Wordmark: "${kit.wordmark.text}", ${kit.wordmark.case}, tracking ${kit.wordmark.tracking}, placed ${kit.wordmark.placement}, ${Math.round(kit.wordmark.widthRatio * 100)}% of image width.`,
    `Typeface: ${kit.typeface.family}.`,
    `Rules: ${kit.rules.join(' ')}`,
  ].join('\n');
}

export function assertUniqueTaskIds(tasks: readonly MediaTask[]): void {
  const seen = new Set<string>();
  for (const { task } of tasks) {
    if (seen.has(task.id))
      throw new Error(`Duplicate media task id "${task.id}"`);
    seen.add(task.id);
  }
}
