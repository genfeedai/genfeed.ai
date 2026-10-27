import { randomUUID } from 'node:crypto';
import {
  matchStoryboardARollChunks,
  planStoryboardARollChunks,
  type StoryboardARollChunkInput,
  storyboardARollJoins,
} from '@api/collections/content-runs/services/storyboard-a-roll-plan';
import {
  assembleStoryboardLongFormDraft,
  buildStoryboardLongFormDraftMessages,
  normalizeStoryboardLongForm,
  type StoryboardLongFormDraftRequest,
  storyboardLongFormDraftOutputSchema,
  storyboardLongFormProblems,
} from '@api/collections/content-runs/services/storyboard-long-form-draft';
import {
  buildLongFormCaptions,
  buildLongFormTimeline,
} from '@api/collections/content-runs/services/storyboard-long-form-timeline';
import draftedPlan from '@api-test/fixtures/long-form-benchmark/drafted-plan.json';
import voiceNote from '@api-test/fixtures/long-form-benchmark/voice-note.json';
import {
  STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS,
  type StoryboardARollChunk,
} from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it } from 'vitest';

/**
 * The free half of the long-form benchmark (#8218): one fixed voice note,
 * replayed through every stage that costs nothing. The drafter's reply is
 * recorded, renders are simulated at a measured length 10% slower than the
 * estimate, and the edit is laid out. The paid half (the HeyGen presenter
 * and the stills) is the live acceptance run in #8227; the same transcript
 * is published as the `long-form-presenter` task in genfeedai/benchmark.
 */

/** Real avatar speech runs slower than the drafted estimate. */
const MEASURED_SLOWDOWN = 1.1;

const presenterId = 'benchmark-presenter';

const emptyPlan: StoryboardPlan = {
  videoModelKey: null,
  title: '',
  logline: '',
  format: '16:9',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [
    {
      id: presenterId,
      name: voiceNote.presenter.name,
      referenceAssetIds: [],
      avatarAssetId: voiceNote.presenter.avatarAssetId,
      voiceId: voiceNote.presenter.voiceId,
    },
  ],
  shots: [],
  longForm: {
    runtimeBudgetSeconds: voiceNote.runtimeBudgetSeconds,
    presenterId,
    segments: [],
  },
};

const request: StoryboardLongFormDraftRequest = {
  brandId: 'benchmark-brand',
  organizationId: 'benchmark-org',
  userId: 'benchmark-user',
  brand: { name: 'Benchmark studio' },
  brief: voiceNote.transcript,
  current: emptyPlan,
  mode: 'draft',
  runtimeBudgetSeconds: voiceNote.runtimeBudgetSeconds,
};

function draft(): StoryboardPlan {
  return assembleStoryboardLongFormDraft(
    request,
    storyboardLongFormDraftOutputSchema.parse(draftedPlan.reply),
  );
}

function render(
  inputs: readonly StoryboardARollChunkInput[],
): StoryboardARollChunk[] {
  return inputs.map((input, index) => ({
    ...input,
    id: randomUUID(),
    ordinal: index + 1,
    durationSeconds: input.estimatedSeconds * MEASURED_SLOWDOWN,
    state: 'ready',
    assetId: `benchmark-a-roll-${index + 1}`,
    actorUserId: 'benchmark-user',
    credits: 0,
    billingMode: 'byok',
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
  }));
}

describe('long-form benchmark: voice note to presenter edit', () => {
  it('sends the whole voice note to the drafter', () => {
    const prompt = buildStoryboardLongFormDraftMessages(request, 'Brand brief.')
      .map((message) => message.content)
      .join('\n');

    expect(prompt).toContain(voiceNote.transcript);
  });

  it('drafts an approvable plan inside the runtime budget', () => {
    const plan = draft();
    const segments = plan.longForm?.segments ?? [];
    const spoken = segments.reduce(
      (sum, segment) => sum + segment.estimatedSeconds,
      0,
    );

    expect(storyboardLongFormProblems(plan)).toEqual([]);
    expect(segments.map((segment) => segment.sectionLabel)).toEqual([
      'Hook',
      'The kiln',
      'Film the process',
      'Same time, every day',
      'Reuse one session',
      'Close',
    ]);
    expect(spoken).toBeGreaterThan(180);
    expect(spoken).toBeLessThanOrEqual(voiceNote.runtimeBudgetSeconds);
    // Every drafted cutaway fits inside its segment.
    for (const segment of segments)
      for (const cutaway of segment.cutaways)
        expect(
          cutaway.startSeconds + cutaway.durationSeconds,
        ).toBeLessThanOrEqual(segment.estimatedSeconds);
    expect(normalizeStoryboardLongForm(plan)).toEqual(plan);
  });

  it('renders the presenter in as few chunks as the limit allows, losing no words', () => {
    const plan = draft();
    const chunks = planStoryboardARollChunks(plan);
    const narration = (plan.longForm?.segments ?? [])
      .map((segment) => segment.narration)
      .join(' ');

    expect(chunks.length).toBe(
      Math.ceil(narration.length / STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS),
    );
    for (const chunk of chunks)
      expect(chunk.text.length).toBeLessThanOrEqual(
        STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS,
      );
    expect(chunks.map((chunk) => chunk.text).join(' ')).toBe(narration);
  });

  it('lays out an edit where B-roll hides every join between renders', () => {
    const plan = draft();
    const chunks = render(planStoryboardARollChunks(plan));
    const timeline = buildLongFormTimeline(plan, chunks);
    const measured = chunks.reduce(
      (sum, chunk) => sum + (chunk.durationSeconds ?? 0),
      0,
    );

    expect(storyboardARollJoins(chunks).length).toBe(chunks.length - 1);
    expect(timeline.uncoveredJoins).toEqual([]);
    expect(timeline.aRoll).toHaveLength(chunks.length);
    expect(timeline.totalSeconds).toBeCloseTo(measured, 1);
    expect(timeline.cutaways).toHaveLength(
      (plan.longForm?.segments ?? []).flatMap((segment) => segment.cutaways)
        .length,
    );
    const cuts = [...timeline.cutaways].sort(
      (left, right) => left.startSeconds - right.startSeconds,
    );
    for (let index = 1; index < cuts.length; index++) {
      const before = cuts[index - 1];
      const after = cuts[index];
      if (!before || !after) continue;
      expect(before.startSeconds + before.durationSeconds).toBeLessThanOrEqual(
        after.startSeconds + 0.01,
      );
    }
  });

  it('captions every word of the script for the whole video', () => {
    const plan = draft();
    const chunks = render(planStoryboardARollChunks(plan));
    const captions = buildLongFormCaptions(chunks, 84);
    const narration = (plan.longForm?.segments ?? [])
      .map((segment) => segment.narration)
      .join(' ');
    const last = captions.at(-1);

    expect(captions.map((caption) => caption.text).join(' ')).toBe(narration);
    expect(captions.every((caption) => caption.text.length <= 84)).toBe(true);
    expect(captions[0]?.startSeconds).toBe(0);
    expect(
      (last?.startSeconds ?? 0) + (last?.durationSeconds ?? 0),
    ).toBeCloseTo(buildLongFormTimeline(plan, chunks).totalSeconds, 1);
  });

  it('re-renders only the chunk an edit touches', () => {
    const plan = draft();
    const rendered = render(planStoryboardARollChunks(plan));
    const segments = plan.longForm?.segments ?? [];
    const last = segments.at(-1);
    if (!last) throw new Error('The benchmark plan has no segments.');
    const edited: StoryboardPlan = {
      ...plan,
      longForm: {
        ...(plan.longForm as NonNullable<StoryboardPlan['longForm']>),
        segments: [
          ...segments.slice(0, -1),
          {
            ...last,
            narration: last.narration.replace('a little cheaper', 'cheaper'),
          },
        ],
      },
    };

    const matches = matchStoryboardARollChunks(
      planStoryboardARollChunks(edited),
      rendered,
    );

    expect(matches.filter((match) => !match.previous)).toHaveLength(1);
    expect(matches.at(-1)?.previous).toBeUndefined();
  });
});
