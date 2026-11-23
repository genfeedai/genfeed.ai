import { describe, expect, it } from 'vitest';
import type { IHighlight } from '@/props/studio/clipper.props';
import { buildGenerateClipsPayload } from './build-generate-clips-payload';

const highlights = [
  { id: 'a', script: 'Edited', summary: 'First', title: 'One' },
  { id: 'b', summary: 'Second', title: 'Two' },
] as IHighlight[];

const base = {
  avatarId: 'avatar-1',
  avatarProvider: 'heygen' as const,
  editedHighlights: highlights,
  mode: 'avatar' as const,
  selectedHighlightIds: ['a'],
  voiceId: 'voice-1',
};

describe('buildGenerateClipsPayload', () => {
  it('sends the chosen quality for HeyGen and only the selected highlights', () => {
    expect(
      buildGenerateClipsPayload({ ...base, avatarQuality: 'high' }),
    ).toEqual({
      avatarId: 'avatar-1',
      avatarProvider: 'heygen',
      avatarQuality: 'high',
      editedHighlights: [
        { id: 'a', script: 'Edited', summary: 'First', title: 'One' },
      ],
      mode: 'avatar',
      selectedHighlightIds: ['a'],
      voiceId: 'voice-1',
    });
  });

  it.each([
    ['auto', 'heygen', 'avatar'],
    [undefined, 'heygen', 'avatar'],
    ['high', 'argil', 'avatar'],
    ['high', 'heygen', 'raw-cut'],
  ] as const)(
    'omits avatarQuality for quality %s on %s in %s mode',
    (avatarQuality, avatarProvider, mode) => {
      expect(
        buildGenerateClipsPayload({
          ...base,
          avatarProvider,
          avatarQuality,
          mode,
        }),
      ).not.toHaveProperty('avatarQuality');
    },
  );

  it('sends no avatar or voice id for the managed provider', () => {
    expect(
      buildGenerateClipsPayload({ ...base, avatarProvider: 'genfeedai' }),
    ).toMatchObject({ avatarProvider: 'genfeedai' });
    expect(
      buildGenerateClipsPayload({ ...base, avatarProvider: 'genfeedai' }),
    ).not.toHaveProperty('avatarId');
  });
});
