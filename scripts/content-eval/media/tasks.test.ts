import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BENCH_REVISION } from '../bench/schema';
import { readBenchFileAtRevision } from '../bench/schema-drift';
import { buildMediaContestants } from './contestants';
import {
  BENCH_TASK_PACK_DIR,
  BENCH_TASK_PACK_REVISION,
  buildGenerationBriefCorpusTasks,
  KELDER_BRAND_KEY,
  loadBenchTasks,
  loadKelderBrandKit,
  renderBrandKit,
} from './tasks';

const PINNED_FILES = [
  ['image/brand-kit-fidelity.json', 'tasks/image/brand-kit-fidelity.json'],
  [
    'image/character-consistency.json',
    'tasks/image/character-consistency.json',
  ],
  ['image/product-consistency.json', 'tasks/image/product-consistency.json'],
  ['image/prompt-adherence.json', 'tasks/image/prompt-adherence.json'],
  ['image/text-in-image.json', 'tasks/image/text-in-image.json'],
  ['image/unbranded-quality.json', 'tasks/image/unbranded-quality.json'],
  ['video/camera-instruction.json', 'tasks/video/camera-instruction.json'],
  ['video/first-frame-fidelity.json', 'tasks/video/first-frame-fidelity.json'],
  ['video/motion-coherence.json', 'tasks/video/motion-coherence.json'],
  ['kelder-brand-kit.json', 'fixtures/brand-kit/synthetic-brand-kit.json'],
] as const;

describe('pinned bench task pack', () => {
  it('pins the same revision as the bench schema', () => {
    expect(BENCH_TASK_PACK_REVISION).toBe(BENCH_REVISION);
  });

  it('loads the 6 Season One image tasks with Kelder on the brand-kit task', async () => {
    const tasks = await loadBenchTasks({
      includeDrafts: false,
      medium: 'image',
    });
    expect(tasks.map(({ task }) => task.id).sort()).toEqual([
      'brand-kit-fidelity',
      'character-consistency',
      'product-consistency',
      'prompt-adherence',
      'text-in-image',
      'unbranded-quality',
    ]);
    expect(
      tasks.find(({ task }) => task.id === 'brand-kit-fidelity')?.brandKey,
    ).toBe(KELDER_BRAND_KEY);
    expect(tasks.every((task) => task.visibility === 'public')).toBe(true);
  });

  it('keeps the 3 video tasks as drafts unless drafts are requested', async () => {
    expect(
      await loadBenchTasks({ includeDrafts: false, medium: 'video' }),
    ).toEqual([]);
    const drafts = await loadBenchTasks({
      includeDrafts: true,
      medium: 'video',
    });
    expect(drafts).toHaveLength(3);
    expect(drafts.every(({ task }) => task.isDraft)).toBe(true);
  });

  it('renders the Kelder kit with every hex value and rule', async () => {
    const kit = await loadKelderBrandKit();
    const text = renderBrandKit(kit);
    for (const hex of Object.values(kit.palette)) expect(text).toContain(hex);
    for (const rule of kit.rules) expect(text).toContain(rule);
  });

  it.each(PINNED_FILES)(
    '%s is verbatim genfeedai/benchmark %s at the pinned revision',
    async (local, upstream) => {
      const pinned = readBenchFileAtRevision(
        upstream,
        BENCH_TASK_PACK_REVISION,
      );
      if (pinned === null) return; // No sibling checkout (CI): drift is checked locally.
      const copy = await readFile(join(BENCH_TASK_PACK_DIR, local), 'utf8');
      expect(JSON.parse(copy)).toEqual(JSON.parse(pinned));
    },
  );
});

describe('generation-brief corpus tasks', () => {
  it('replays the 12 image and 12 video #3470 scenarios as internal tasks', () => {
    const image = buildGenerationBriefCorpusTasks('image');
    const video = buildGenerationBriefCorpusTasks('video');
    expect(image).toHaveLength(12);
    expect(video).toHaveLength(12);
    expect(
      video.every(({ task }) => task.outputSpec.durationSeconds === 5),
    ).toBe(true);
    expect(
      image.filter(({ brandKey }) => brandKey !== null).length,
    ).toBeGreaterThan(0);
    expect(new Set(image.map(({ task }) => task.id)).size).toBe(12);
  });
});

describe('buildMediaContestants', () => {
  const models = [
    {
      cost: 1,
      isActive: true,
      isLegacy: false,
      key: 'black-forest-labs/flux-schnell',
      label: 'FLUX Schnell',
    },
    {
      cost: 9,
      isActive: true,
      isLegacy: false,
      key: 'openai/gpt-image-2',
      label: 'GPT Image 2',
    },
    {
      cost: 2,
      isActive: true,
      isLegacy: true,
      key: 'stability-ai/sdxl',
      label: 'SDXL',
    },
  ];

  it('enters every active model raw, plus a compiled route where a compiler exists', () => {
    const contestants = buildMediaContestants({
      addedAt: '2026-09-26T00:00:00.000Z',
      compiledFidelity: 'guided',
      medium: 'image',
      models,
      onlyKeys: [],
    });
    const ids = contestants.map(({ contestant }) => contestant.id);
    expect(ids).toContain('black-forest-labs.black-forest-labs-flux-schnell');
    expect(ids).toContain('genfeed-compiled.black-forest-labs-flux-schnell');
    expect(ids).toContain('openai.openai-gpt-image-2');
    expect(ids.some((id) => id.includes('sdxl'))).toBe(false);
    const compiled = contestants.find(({ route }) => route.kind === 'compiled');
    expect(compiled?.contestant.isCompiled).toBe(true);
    expect(compiled?.family).toBe('black-forest-labs');
  });

  it('refuses a requested model that is not an active registry entry', () => {
    expect(() =>
      buildMediaContestants({
        addedAt: '2026-09-26T00:00:00.000Z',
        compiledFidelity: 'guided',
        medium: 'image',
        models,
        onlyKeys: ['stability-ai/sdxl'],
      }),
    ).toThrow(/not active image registry entries/);
  });
});
