import { describe, expect, it } from 'vitest';
import {
  AnalyticsFeedbackExecutor,
  createAnalyticsFeedbackExecutor,
} from './analytics-feedback-executor';
import {
  BrandAssetExecutor,
  createBrandAssetExecutor,
} from './brand-asset-executor';
import {
  BrandContextExecutor,
  createBrandContextExecutor,
} from './brand-context-executor';
import { BrandExecutor, createBrandExecutor } from './brand-executor';
import {
  CinematicColorGradeExecutor,
  createCinematicColorGradeExecutor,
} from './cinematic-color-grade-executor';
import {
  ColorGradeExecutor,
  createColorGradeExecutor,
} from './color-grade-executor';
import {
  createFilmGrainExecutor,
  FilmGrainExecutor,
} from './film-grain-executor';
import {
  createIterativeSeoRefineExecutor,
  IterativeSeoRefineExecutor,
} from './iterative-seo-refine-executor';
import {
  createLensEffectsExecutor,
  LensEffectsExecutor,
} from './lens-effects-executor';
import {
  createMusicSourceExecutor,
  MusicSourceExecutor,
} from './music-source-executor';
import { createPublishExecutor, PublishExecutor } from './publish-executor';
import {
  createSendEmailExecutor,
  SendEmailExecutor,
} from './send-email-executor';
import {
  createSeoRewriteExecutor,
  SeoRewriteExecutor,
} from './seo-rewrite-executor';
import { createSeoScoreExecutor, SeoScoreExecutor } from './seo-score-executor';
import {
  createSoundOverlayExecutor,
  SoundOverlayExecutor,
} from './sound-overlay-executor';
import {
  createTrendHashtagInspirationExecutor,
  TrendHashtagInspirationExecutor,
} from './trend-hashtag-inspiration-executor';
import {
  createTrendSoundInspirationExecutor,
  TrendSoundInspirationExecutor,
} from './trend-sound-inspiration-executor';
import {
  createTrendTriggerExecutor,
  TrendTriggerExecutor,
} from './trend-trigger-executor';
import {
  createTrendVideoInspirationExecutor,
  TrendVideoInspirationExecutor,
} from './trend-video-inspiration-executor';

interface FactoryCase {
  name: string;
  // biome-ignore lint/suspicious/noExplicitAny: heterogenous constructor list in a table-driven test
  expected: new (
    ...args: any[]
  ) => unknown;
  create: () => unknown;
}

const cases: FactoryCase[] = [
  {
    create: () => createAnalyticsFeedbackExecutor(),
    expected: AnalyticsFeedbackExecutor,
    name: 'analytics feedback',
  },
  {
    create: () => createBrandAssetExecutor(),
    expected: BrandAssetExecutor,
    name: 'brand asset',
  },
  {
    create: () => createBrandContextExecutor(),
    expected: BrandContextExecutor,
    name: 'brand context',
  },
  {
    create: () => createBrandExecutor(),
    expected: BrandExecutor,
    name: 'brand',
  },
  {
    create: () => createCinematicColorGradeExecutor(),
    expected: CinematicColorGradeExecutor,
    name: 'cinematic color grade',
  },
  {
    create: () => createColorGradeExecutor(),
    expected: ColorGradeExecutor,
    name: 'color grade',
  },
  {
    create: () => createFilmGrainExecutor(),
    expected: FilmGrainExecutor,
    name: 'film grain',
  },
  {
    create: () => createIterativeSeoRefineExecutor(),
    expected: IterativeSeoRefineExecutor,
    name: 'iterative seo refine',
  },
  {
    create: () => createLensEffectsExecutor(),
    expected: LensEffectsExecutor,
    name: 'lens effects',
  },
  {
    create: () => createMusicSourceExecutor(),
    expected: MusicSourceExecutor,
    name: 'music source',
  },
  {
    create: () => createPublishExecutor(),
    expected: PublishExecutor,
    name: 'publish',
  },
  {
    create: () => createSendEmailExecutor(),
    expected: SendEmailExecutor,
    name: 'send email',
  },
  {
    create: () => createSeoRewriteExecutor(),
    expected: SeoRewriteExecutor,
    name: 'seo rewrite',
  },
  {
    create: () => createSeoScoreExecutor(),
    expected: SeoScoreExecutor,
    name: 'seo score',
  },
  {
    create: () => createSoundOverlayExecutor(),
    expected: SoundOverlayExecutor,
    name: 'sound overlay',
  },
  {
    create: () => createTrendHashtagInspirationExecutor(),
    expected: TrendHashtagInspirationExecutor,
    name: 'trend hashtag inspiration',
  },
  {
    create: () => createTrendSoundInspirationExecutor(),
    expected: TrendSoundInspirationExecutor,
    name: 'trend sound inspiration',
  },
  {
    create: () => createTrendTriggerExecutor(),
    expected: TrendTriggerExecutor,
    name: 'trend trigger',
  },
  {
    create: () => createTrendVideoInspirationExecutor(),
    expected: TrendVideoInspirationExecutor,
    name: 'trend video inspiration',
  },
];

describe('SaaS executor factories', () => {
  for (const factoryCase of cases) {
    it(`${factoryCase.name} factory returns a configured executor`, () => {
      const executor = factoryCase.create();
      expect(executor).toBeInstanceOf(factoryCase.expected);
      expect(
        (executor as { nodeType: string }).nodeType.length,
      ).toBeGreaterThan(0);
    });
  }
});
