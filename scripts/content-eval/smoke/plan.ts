/**
 * The generation-type smoke plan: which eval suites run, with what models, and
 * how one hard spend cap is split between them. Pure, so the budget rules are
 * unit-tested without a provider.
 *
 * Every suite already refuses to run uncapped and aborts with a partial report
 * when its own cap is hit; the plan gives each cell a share of the run cap, so
 * the sum of the caps can never exceed what the operator allowed.
 */

import { UsageError } from '../cli';
import {
  SMOKE_MEDIUMS,
  type SmokeMedium,
} from '../context-coverage/generation-types';

export const SMOKE_TEXT_FIXTURE =
  'apps/server/api/test/fixtures/content-evals/smoke/text.synthetic.jsonl';

/** The media suite builds its own tasks; the CLI still wants a fixture path. */
const MEDIA_FIXTURE_PLACEHOLDER =
  'scripts/content-eval/media/tasks/bench-851b7c8';

/** Cheapest cross-family pair in the registry (lowest-cost-models.constant.ts). */
export const SMOKE_TEXT_MODEL = 'deepseek/deepseek-v4-flash-0731';
export const SMOKE_TEXT_JUDGE = 'openai/gpt-5.6-luna';

/** Three families, none of them a media contestant's (bench rule). */
export const SMOKE_MEDIA_JUDGES = [
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.6-terra',
  'google/gemini-3.5-flash-lite',
] as const;

export const SMOKE_IMAGE_MODEL = 'black-forest-labs/flux-schnell';
export const SMOKE_VIDEO_MODEL = 'prunaai/p-video';

/** Below this the text cell cannot finish 18 rows, so the run is refused. */
export const MIN_SMOKE_CREDITS = 20;

const SHARES: Record<SmokeMedium, number> = {
  image: 0.4,
  text: 0.1,
  video: 0.5,
};

export interface SmokeCell {
  /** Cell id, also the report file stem. */
  id: string;
  medium: SmokeMedium;
  /** Credits this cell may spend; the suite aborts itself at this cap. */
  maxCredits: number;
  /** Extra environment a live run needs; a missing one skips the cell loudly. */
  requiresEnv: readonly string[];
  /** Flags for `bun run eval:content --`, without `--out`. */
  args: readonly string[];
}

export interface SmokePlan {
  cells: readonly SmokeCell[];
  maxCredits: number;
  /** Mediums left out of the plan on purpose (e.g. video under a small cap). */
  skippedMediums: readonly SmokeMedium[];
}

export interface SmokePlanOptions {
  dispatcher: 'stub' | 'live';
  /** Mediums to run; text is the nightly lane, all three the release smoke. */
  mediums: readonly SmokeMedium[];
  maxCredits: number;
  /** eval-org brand id of the synthetic Kelder brand (live media cells). */
  kelderBrandId?: string;
  /** Product API base the media cells generate through (live). */
  genfeedApiUrl?: string;
}

/** Floors to a cent so the shares never add up to more than the cap. */
function share(maxCredits: number, ratio: number): number {
  return Math.floor(maxCredits * ratio * 100) / 100;
}

export function buildSmokePlan(options: SmokePlanOptions): SmokePlan {
  if (!Number.isFinite(options.maxCredits) || options.maxCredits <= 0) {
    throw new UsageError('A smoke run needs a positive --max-credits cap');
  }
  if (options.maxCredits < MIN_SMOKE_CREDITS) {
    throw new UsageError(
      `--max-credits=${options.maxCredits} is below the ${MIN_SMOKE_CREDITS}-credit floor: the text cell cannot finish`,
    );
  }

  const mediums = SMOKE_MEDIUMS.filter((medium) =>
    options.mediums.includes(medium),
  );
  if (mediums.length === 0) {
    throw new UsageError(
      '--mediums must name at least one of text,image,video',
    );
  }
  const total = mediums.reduce((sum, medium) => sum + SHARES[medium], 0);
  const mediaArgs = (medium: 'image' | 'video', model: string): string[] => [
    '--suite=media-ladder',
    `--fixture=${MEDIA_FIXTURE_PLACEHOLDER}`,
    `--medium=${medium}`,
    '--task-set=bench',
    ...(medium === 'video' ? ['--include-drafts=true'] : []),
    `--models=${model}`,
    `--judge=${SMOKE_MEDIA_JUDGES.join(',')}`,
    ...(options.kelderBrandId
      ? [`--brands=kelder:${options.kelderBrandId}`]
      : []),
    ...(options.genfeedApiUrl
      ? [`--genfeed-api-url=${options.genfeedApiUrl}`]
      : []),
  ];
  const mediaEnv =
    options.dispatcher === 'live' ? ['CONTENT_EVAL_GENFEED_API_KEY'] : [];

  const cells: SmokeCell[] = mediums.map((medium) => {
    const maxCredits = share(options.maxCredits, SHARES[medium] / total);
    const common = {
      maxCredits,
      medium,
    };
    if (medium === 'text') {
      return {
        ...common,
        args: [
          '--suite=harness-ab',
          `--fixture=${SMOKE_TEXT_FIXTURE}`,
          `--models=${SMOKE_TEXT_MODEL}`,
          `--judge=${SMOKE_TEXT_JUDGE}`,
        ],
        id: 'text',
        requiresEnv: [],
      };
    }
    return {
      ...common,
      args:
        medium === 'image'
          ? mediaArgs('image', SMOKE_IMAGE_MODEL)
          : mediaArgs('video', SMOKE_VIDEO_MODEL),
      id: medium,
      requiresEnv: mediaEnv,
    };
  });

  return {
    cells,
    maxCredits: options.maxCredits,
    skippedMediums: SMOKE_MEDIUMS.filter((medium) => !mediums.includes(medium)),
  };
}

export function plannedCredits(plan: SmokePlan): number {
  return plan.cells.reduce((sum, cell) => sum + cell.maxCredits, 0);
}
