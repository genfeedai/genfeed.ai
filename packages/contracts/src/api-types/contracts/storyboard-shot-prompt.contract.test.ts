import { describe, expect, it } from 'vitest';
import {
  type StoryboardPlan,
  type StoryboardShot,
  storyboardPlanSchema,
} from './storyboard-plan.contract';
import { compileStoryboardShotPrompt } from './storyboard-shot-prompt.contract';

function shot(overrides: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id: 'shot-1',
    ordinal: 1,
    action: 'Mia checks the clock and runs for the door.',
    dialogue: 'I am late.',
    speakerId: 'mia',
    onScreenSpeaker: false,
    durationSeconds: 6,
    stillAssetId: 'still-1',
    stillFreshness: 'fresh',
    transition: 'cut',
    ...overrides,
  };
}

function plan(shots: StoryboardShot[] = [shot()]): StoryboardPlan {
  return {
    videoModelKey: null,
    title: 'Late',
    logline: '',
    format: '9:16',
    runtimeBudgetSeconds: 30,
    styleReferenceAssetIds: ['style-1'],
    cast: [{ id: 'mia', name: 'Mia', referenceAssetIds: ['mia-1'] }],
    shots,
  };
}

function issueMessages(value: StoryboardPlan): string[] {
  const result = storyboardPlanSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe('compileStoryboardShotPrompt', () => {
  it('writes the timed cuts, the line and the sound effects in order', () => {
    const value = shot({
      cuts: [
        { startSeconds: 0, endSeconds: 2, framing: 'Close-up on the clock' },
        {
          startSeconds: 2,
          endSeconds: 6,
          framing: 'Side profile of Mia',
          camera: 'handheld tracking',
        },
      ],
      sfx: ['ticking clock', 'door slam'],
      referenceRoles: [
        { assetId: 'face-1', role: 'character_face', label: 'Mia' },
        { assetId: 'room-1', role: 'environment', label: 'Kitchen' },
      ],
    });
    expect(
      compileStoryboardShotPrompt(plan([value]), value, {
        isAudioEnabled: true,
        maxReferences: 9,
      }),
    ).toEqual({
      prompt:
        'Reference images: image 1 is the opening frame; image 2 is the environment (Kitchen); image 3 is the face of Mia. Mia checks the clock and runs for the door. 0-2s: Close-up on the clock. 2-6s: Side profile of Mia, handheld tracking. Spoken line: "I am late." Sound effects: ticking clock, door slam. Keep every person consistent with the reference images.',
      referenceAssetIds: ['still-1', 'room-1', 'face-1', 'mia-1', 'style-1'],
      namedReferenceCount: 3,
      isCustom: false,
    });
  });

  it('leaves sound out for a silent model and caps the references', () => {
    const value = shot({ sfx: ['ticking clock'] });
    expect(
      compileStoryboardShotPrompt(plan([value]), value, {
        isAudioEnabled: false,
        maxReferences: 2,
      }),
    ).toEqual({
      prompt:
        'Mia checks the clock and runs for the door. Keep every person consistent with the reference images.',
      referenceAssetIds: ['still-1', 'mia-1'],
      namedReferenceCount: 1,
      isCustom: false,
    });
  });

  it('sends the prompt the person wrote in place of the compiled one', () => {
    const value = shot({ videoPrompt: 'Handheld, rain on the window.' });
    expect(
      compileStoryboardShotPrompt(plan([value]), value, {
        isAudioEnabled: true,
        maxReferences: 4,
      }),
    ).toMatchObject({
      prompt: 'Handheld, rain on the window.',
      referenceAssetIds: ['still-1', 'mia-1', 'style-1'],
      isCustom: true,
    });
  });

  it('describes a still that also has a role both ways and sends it once', () => {
    const value = shot({
      dialogue: undefined,
      cuts: [{ startSeconds: 0.25, endSeconds: 1.05, framing: 'Close-up' }],
      referenceRoles: [
        { assetId: 'still-1', role: 'environment', label: 'Kitchen' },
      ],
    });
    expect(
      compileStoryboardShotPrompt(plan([value]), value, {
        isAudioEnabled: false,
        maxReferences: 9,
      }),
    ).toEqual({
      prompt:
        'Reference images: image 1 is the opening frame and the environment (Kitchen). Mia checks the clock and runs for the door. 0.25-1.05s: Close-up. Keep every person consistent with the reference images.',
      referenceAssetIds: ['still-1', 'mia-1', 'style-1'],
      namedReferenceCount: 1,
      isCustom: false,
    });
  });
});

describe('storyboardPlanSchema shot cuts', () => {
  it.each([
    [
      [{ startSeconds: 2, endSeconds: 1, framing: 'Wide' }],
      'A cut must end after it starts.',
    ],
    [
      [
        { startSeconds: 0, endSeconds: 3, framing: 'Wide' },
        { startSeconds: 2, endSeconds: 4, framing: 'Close' },
      ],
      'Cuts must follow each other without overlapping.',
    ],
    [
      [{ startSeconds: 0, endSeconds: 7, framing: 'Wide' }],
      'A cut must end inside its shot.',
    ],
  ])('rejects %j', (cuts, message) => {
    expect(issueMessages(plan([shot({ cuts })]))).toContain(message);
  });

  it('rejects one image with two roles in a shot', () => {
    expect(
      issueMessages(
        plan([
          shot({
            referenceRoles: [
              { assetId: 'a', role: 'environment' },
              { assetId: 'a', role: 'prop' },
            ],
          }),
        ]),
      ),
    ).toContain('Give each reference image one role.');
  });
});
